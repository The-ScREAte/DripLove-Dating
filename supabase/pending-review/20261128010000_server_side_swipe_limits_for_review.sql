-- FOR REVIEW - NOT APPLIED. Server-side daily swipe limit + undo that refunds the swipe.
--
-- Today the app inserts the like/pass first and bumps user_usage in a second call, so a modified app can
-- skip the second call. These two functions do both in ONE transaction and read the plan from the database
-- (never from the client). Requires 20261128000000_free_undo_limit_2_for_review.sql's limit (2 undos) - the
-- constant is repeated here so the two can be applied independently.
--
-- Old app versions keep using like_and_usage_batched / pass_and_usage_batched and update_user_usage, so
-- nothing breaks for them. To make the limit un-bypassable, REVOKE direct INSERT on public.likes / public.passes
-- and UPDATE on public.user_usage for `authenticated` once old versions are retired (force update).

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

  SELECT (plan_name = 'premium') INTO v_premium FROM public.get_user_subscription(uid) LIMIT 1;
  v_premium := COALESCE(v_premium, false);

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
      SELECT EXISTS (
        SELECT 1 FROM public.matches
        WHERE (user1_id = uid AND user2_id = target_param) OR (user1_id = target_param AND user2_id = uid)
      ) INTO v_match_exists;
      IF NOT v_match_exists THEN
        INSERT INTO public.matches (user1_id, user2_id, created_at, user1_unread_count, user2_unread_count)
        VALUES (uid, target_param, now(), 0, 0) RETURNING id INTO v_new_match_id;
        RETURN jsonb_build_object('success', true, 'match', true, 'match_id', v_new_match_id, 'current_usage', v_used, 'limit', v_limit, 'counted', true);
      END IF;
      RETURN jsonb_build_object('success', true, 'match', true, 'match_exists', true, 'current_usage', v_used, 'limit', v_limit, 'counted', true);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'match', false, 'current_usage', v_used, 'limit', v_limit, 'counted', true);
END;
$function$;

-- Undo the last pass: free members get 2 a day (premium unlimited); the swipe it used is given back.
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

  SELECT (plan_name = 'premium') INTO v_premium FROM public.get_user_subscription(uid) LIMIT 1;
  v_premium := COALESCE(v_premium, false);

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
