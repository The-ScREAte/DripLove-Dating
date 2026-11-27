-- Server-side swipe/undo limits (2026-11-27). Consolidates and replaces the two files in supabase/pending-review:
--  * update_user_usage: free undo limit 1 -> 2, ownership guard KEPT, premium = current plan (expiry aware)
--  * discover_swipe: like/pass + usage in ONE transaction, limit read from the DB, blocks + 14-day cooldown enforced,
--    new match id returned
--  * undo_pass: 2/day free, gives the swipe back

CREATE OR REPLACE FUNCTION public.update_user_usage(user_id_param uuid, usage_type text, increment_by integer DEFAULT 1)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_usage INTEGER := 0;
  usage_limit INTEGER := 0;
  result JSON;
BEGIN
  /*ownership_guard*/
  IF auth.role() IN ('anon','authenticated') AND auth.uid() IS DISTINCT FROM user_id_param THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Set limits based on the CURRENT plan (expiry aware; cancelled-but-expired premium is not unlimited)
  IF public._is_premium_now(user_id_param) THEN
    usage_limit := -1; -- Unlimited for premium
  ELSE
    -- Free plan limits
    CASE usage_type
      WHEN 'swipe' THEN
        usage_limit := 50;
      WHEN 'reverse_dislike' THEN
        usage_limit := 2;
      ELSE
        usage_limit := 0;
    END CASE;
  END IF;

  -- Get current usage for today
  SELECT COALESCE(
    CASE usage_type
      WHEN 'swipe' THEN swipes_used
      WHEN 'reverse_dislike' THEN reverse_dislikes_used
      ELSE 0
    END, 0
  )
  INTO current_usage
  FROM public.user_usage
  WHERE user_id = user_id_param
    AND date = CURRENT_DATE;

  -- If no record exists, current_usage will be NULL, so set to 0
  current_usage := COALESCE(current_usage, 0);

  -- Check if user has exceeded limit (skip check for premium users)
  IF usage_limit != -1 AND (current_usage + increment_by) > usage_limit THEN
    result := json_build_object(
      'success', false,
      'message', 'Daily limit reached. Upgrade to Premium for more swipes!',
      'current_usage', current_usage,
      'limit', usage_limit
    );
    RETURN result;
  END IF;

  -- Update usage (insert or update)
  INSERT INTO public.user_usage (user_id, date, swipes_used, reverse_dislikes_used)
  VALUES (
    user_id_param,
    CURRENT_DATE,
    CASE WHEN usage_type = 'swipe' THEN increment_by ELSE 0 END,
    CASE WHEN usage_type = 'reverse_dislike' THEN increment_by ELSE 0 END
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    swipes_used = CASE
      WHEN usage_type = 'swipe' THEN public.user_usage.swipes_used + increment_by
      ELSE public.user_usage.swipes_used
    END,
    reverse_dislikes_used = CASE
      WHEN usage_type = 'reverse_dislike' THEN public.user_usage.reverse_dislikes_used + increment_by
      ELSE public.user_usage.reverse_dislikes_used
    END,
    updated_at = NOW();

  -- Get updated usage
  SELECT COALESCE(
    CASE usage_type
      WHEN 'swipe' THEN swipes_used
      WHEN 'reverse_dislike' THEN reverse_dislikes_used
      ELSE 0
    END, 0
  )
  INTO current_usage
  FROM public.user_usage
  WHERE user_id = user_id_param
    AND date = CURRENT_DATE;

  result := json_build_object(
    'success', true,
    'message', 'Usage updated successfully',
    'current_usage', current_usage,
    'limit', usage_limit
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discover_swipe(kind_param text, target_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_premium boolean := false;
  v_used integer;
  v_limit constant integer := 50;
  v_rows integer := 0;
  v_counted boolean := false;
  v_match_exists boolean;
  v_new_match_id uuid;
  v_mutual boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF kind_param NOT IN ('like', 'pass') OR target_param IS NULL OR target_param = uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid');
  END IF;

  v_premium := public._is_premium_now(uid);

  IF kind_param = 'like' THEN
    IF EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = uid AND b.blocked_id = target_param) OR (b.blocker_id = target_param AND b.blocked_id = uid)) THEN
      RETURN jsonb_build_object('success', false, 'match', false, 'blocked', true);
    END IF;
    IF EXISTS (SELECT 1 FROM public.match_cooldowns c WHERE c.user1_id = LEAST(uid, target_param) AND c.user2_id = GREATEST(uid, target_param) AND c.expires_at > now()) THEN
      RETURN jsonb_build_object('success', false, 'match', false, 'cooldown', true);
    END IF;
  END IF;

  -- one row per user per day, locked so two fast swipes can't both slip under the limit
  INSERT INTO public.user_usage (user_id, date, swipes_used, reverse_dislikes_used)
  VALUES (uid, CURRENT_DATE, 0, 0) ON CONFLICT (user_id, date) DO NOTHING;
  SELECT swipes_used INTO v_used FROM public.user_usage WHERE user_id = uid AND date = CURRENT_DATE FOR UPDATE;

  IF NOT v_premium AND v_used >= v_limit THEN
    RETURN jsonb_build_object('success', false, 'limit_reached', true, 'current_usage', v_used, 'limit', v_limit);
  END IF;

  IF kind_param = 'like' THEN
    INSERT INTO public.likes (liker_id, liked_id, created_at) VALUES (uid, target_param, now()) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_counted := v_rows > 0;
  ELSE
    -- a pass that already exists from an earlier day counts again (same as before); one from today does not
    IF EXISTS (SELECT 1 FROM public.passes WHERE passer_id = uid AND passed_id = target_param AND passed_at >= CURRENT_DATE) THEN
      v_counted := false;
    ELSE
      v_counted := true;
    END IF;
    INSERT INTO public.passes (passer_id, passed_id, passed_at) VALUES (uid, target_param, now())
    ON CONFLICT (passer_id, passed_id) DO UPDATE SET passed_at = now();
  END IF;

  IF v_counted THEN
    UPDATE public.user_usage SET swipes_used = swipes_used + 1, updated_at = now() WHERE user_id = uid AND date = CURRENT_DATE
    RETURNING swipes_used INTO v_used;
  END IF;

  IF kind_param = 'like' THEN
    SELECT EXISTS (SELECT 1 FROM public.likes WHERE liker_id = target_param AND liked_id = uid) INTO v_mutual;
    IF v_mutual THEN
      SELECT m.id INTO v_new_match_id FROM public.matches m
      WHERE (m.user1_id = uid AND m.user2_id = target_param) OR (m.user1_id = target_param AND m.user2_id = uid) LIMIT 1;
      IF v_new_match_id IS NULL THEN
        INSERT INTO public.matches (user1_id, user2_id, created_at, user1_unread_count, user2_unread_count)
        VALUES (LEAST(uid, target_param), GREATEST(uid, target_param), now(), 0, 0)
        ON CONFLICT (user1_id, user2_id) DO NOTHING RETURNING id INTO v_new_match_id;
      END IF;
      RETURN jsonb_build_object('success', true, 'match', true, 'match_id', v_new_match_id, 'current_usage', v_used, 'limit', v_limit, 'counted', true);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'match', false, 'current_usage', v_used, 'limit', v_limit, 'counted', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.undo_pass(target_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_premium boolean := false;
  v_undo_limit constant integer := 2;
  v_undos integer;
  v_pass_day date;
  v_used integer;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_premium := public._is_premium_now(uid);

  INSERT INTO public.user_usage (user_id, date, swipes_used, reverse_dislikes_used)
  VALUES (uid, CURRENT_DATE, 0, 0) ON CONFLICT (user_id, date) DO NOTHING;
  SELECT reverse_dislikes_used, swipes_used INTO v_undos, v_used
  FROM public.user_usage WHERE user_id = uid AND date = CURRENT_DATE FOR UPDATE;

  IF NOT v_premium AND v_undos >= v_undo_limit THEN
    RETURN jsonb_build_object('success', false, 'limit_reached', true, 'undos_used', v_undos, 'limit', v_undo_limit);
  END IF;

  DELETE FROM public.passes WHERE passer_id = uid AND passed_id = target_param
  RETURNING passed_at::date INTO v_pass_day;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  UPDATE public.user_usage
  SET reverse_dislikes_used = reverse_dislikes_used + 1,
      -- only a pass made today was counted today, so only that one is given back
      swipes_used = CASE WHEN v_pass_day = CURRENT_DATE THEN GREATEST(swipes_used - 1, 0) ELSE swipes_used END,
      updated_at = now()
  WHERE user_id = uid AND date = CURRENT_DATE
  RETURNING swipes_used, reverse_dislikes_used INTO v_used, v_undos;

  RETURN jsonb_build_object('success', true, 'current_usage', v_used, 'undos_used', v_undos, 'limit', v_undo_limit);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.discover_swipe(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_swipe(text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.undo_pass(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_pass(uuid) TO authenticated, service_role;
