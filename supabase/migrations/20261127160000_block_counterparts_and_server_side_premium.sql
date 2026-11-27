-- Applied 2026-11-27 (tested first in a rolled-back transaction).
-- 1) get_block_counterparts(): RLS on public.blocks only lets a user SELECT rows they created, so the app could
--    never see "this person blocked me" and kept showing blockers in Discover/Circle. This SECURITY DEFINER RPC
--    returns both directions for the caller only.
-- 2) like_and_usage_batched: refuse (no insert, no match) when either side blocked the other or the pair is in the
--    14-day post-unmatch cooldown. Previously only the client filtered these.
-- 3) circle_like_and_usage_batched: the daily cap (20 free / 100 premium) used the CLIENT-supplied premium_param,
--    so a free user could send premium_param=true to get 100. Premium is now derived from user_subscriptions.

CREATE OR REPLACE FUNCTION public.get_block_counterparts()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.blocked_id FROM public.blocks b WHERE b.blocker_id = auth.uid() AND auth.uid() IS NOT NULL
  UNION
  SELECT b.blocker_id FROM public.blocks b WHERE b.blocked_id = auth.uid() AND auth.uid() IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.get_block_counterparts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_block_counterparts() TO authenticated;

-- internal helper, same rule as get_current_subscription_status (30 min grace), without its side effects
CREATE OR REPLACE FUNCTION public._is_premium_now(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT us.plan_name = 'premium'
       AND us.status IN ('active','cancelled','payment_pending')
       AND (us.expires_at IS NULL OR us.expires_at > now() - interval '30 minutes')
    FROM public.user_subscriptions us
    WHERE us.user_id = p_user
    ORDER BY us.created_at DESC
    LIMIT 1
  ), false);
$$;
REVOKE EXECUTE ON FUNCTION public._is_premium_now(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.like_and_usage_batched(liker_id_param uuid, liked_id_param uuid, premium_param boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mutual_like_exists boolean;
  v_match_exists boolean;
  v_new_match_id uuid;
BEGIN
  IF auth.role() IN ('anon','authenticated') AND auth.uid() IS DISTINCT FROM liker_id_param THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.blocks b
             WHERE (b.blocker_id = liker_id_param AND b.blocked_id = liked_id_param)
                OR (b.blocker_id = liked_id_param AND b.blocked_id = liker_id_param)) THEN
    RETURN jsonb_build_object('success', false, 'match', false, 'blocked', true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_cooldowns c
             WHERE c.user1_id = LEAST(liker_id_param, liked_id_param)
               AND c.user2_id = GREATEST(liker_id_param, liked_id_param)
               AND c.expires_at > now()) THEN
    RETURN jsonb_build_object('success', false, 'match', false, 'cooldown', true);
  END IF;

  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (liker_id_param, liked_id_param, now())
  ON CONFLICT DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM likes WHERE liker_id = liked_id_param AND liked_id = liker_id_param)
  INTO v_mutual_like_exists;

  IF v_mutual_like_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM matches
      WHERE (user1_id = liker_id_param AND user2_id = liked_id_param)
         OR (user1_id = liked_id_param AND user2_id = liker_id_param)
    ) INTO v_match_exists;

    IF NOT v_match_exists THEN
      INSERT INTO matches (user1_id, user2_id, created_at, user1_unread_count, user2_unread_count)
      VALUES (LEAST(liker_id_param, liked_id_param), GREATEST(liker_id_param, liked_id_param), now(), 0, 0)
      ON CONFLICT (user1_id, user2_id) DO NOTHING
      RETURNING id INTO v_new_match_id;
      RETURN jsonb_build_object('success', true, 'match', true, 'match_id', v_new_match_id);
    END IF;
    RETURN jsonb_build_object('success', true, 'match', true, 'match_exists', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'match', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.circle_like_and_usage_batched(liker_id_param uuid, liked_id_param uuid, premium_param boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_used integer;
  v_like_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> liker_id_param THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF liker_id_param = liked_id_param THEN
    RAISE EXCEPTION 'You cannot like your own profile';
  END IF;

  -- plan comes from the database, never from the client's premium_param
  v_limit := CASE WHEN public._is_premium_now(liker_id_param) THEN 100 ELSE 20 END;

  INSERT INTO public.user_usage (user_id, date, circle_likes_used)
  VALUES (liker_id_param, CURRENT_DATE, 0)
  ON CONFLICT (user_id, date) DO NOTHING;

  SELECT circle_likes_used INTO v_used
  FROM public.user_usage
  WHERE user_id = liker_id_param AND date = CURRENT_DATE
  FOR UPDATE;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('success', false, 'limit_reached', true, 'current_usage', v_used, 'limit', v_limit, 'remaining', 0);
  END IF;

  SELECT public.like_and_usage_batched(liker_id_param, liked_id_param, false) INTO v_like_result;

  -- a refused like (blocked / cooldown) must not burn the daily allowance
  IF COALESCE((v_like_result->>'success')::boolean, true) = false THEN
    RETURN v_like_result || jsonb_build_object('limit_reached', false, 'current_usage', v_used, 'limit', v_limit,
                                               'remaining', GREATEST(v_limit - v_used, 0));
  END IF;

  UPDATE public.user_usage
  SET circle_likes_used = circle_likes_used + 1, updated_at = now()
  WHERE user_id = liker_id_param AND date = CURRENT_DATE
  RETURNING circle_likes_used INTO v_used;

  RETURN COALESCE(v_like_result, '{}'::jsonb) || jsonb_build_object(
    'success', true, 'limit_reached', false, 'current_usage', v_used, 'limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0));
END;
$function$;

-- Keep grants as before (authenticated only).
REVOKE EXECUTE ON FUNCTION public.like_and_usage_batched(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.like_and_usage_batched(uuid, uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.circle_like_and_usage_batched(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.circle_like_and_usage_batched(uuid, uuid, boolean) TO authenticated;
