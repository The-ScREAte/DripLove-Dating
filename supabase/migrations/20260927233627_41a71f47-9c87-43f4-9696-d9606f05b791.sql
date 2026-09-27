-- Circle Up: best-practice live matchmaking.
--
-- Two problems fixed here:
--
-- 1. The candidate list excluded everyone in public.likes. That silently
--    hid anyone you had already liked - and since every match starts with
--    a like, it made the "Matched" tab structurally impossible to fill.
--    Circle Up is live video with people who are online RIGHT NOW; a past
--    swipe is not a reason to hide them. Only blocks and active match
--    cooldowns stay excluded. Recent passes stay excluded for the
--    not-matched tab only (you passed on them), but never hide someone
--    you are actually matched with.
--
-- 2. Distance was a hard cut-off, so a user with a 50km radius in a
--    thinly populated area spun forever even while people were live.
--    Now the pool is tiered and widened automatically:
--      0 = nearby      (same country, inside your distance setting)
--      1 = unlocked    (premium, a country you unlocked)
--      2 = national    (same country, beyond your distance setting)
--      3 = abroad      (anywhere else in the world)
--    Everyone eligible is returned, ordered nearest-tier first, so local
--    people always come up before the search reaches abroad.

DROP FUNCTION IF EXISTS public.circle_up_list_candidates(uuid, text);

CREATE FUNCTION public.circle_up_list_candidates(p_user_id uuid, p_filter text DEFAULT 'everyone')
RETURNS TABLE(candidate_id uuid, is_matched boolean, scope text, distance_km numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_self public.profiles;
  v_is_premium boolean;
  v_allowed_genders text[];
  v_min_age integer;
  v_max_age integer;
  v_max_distance_km numeric;
  v_excluded_ids uuid[];
  v_passed_ids uuid[];
BEGIN
  SELECT * INTO v_self FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Heartbeat: browsing the grid keeps you visible in everyone else's.
  UPDATE public.circle_up_queue
  SET updated_at = now()
  WHERE user_id = p_user_id AND status = 'waiting';

  SELECT (s.plan_name = 'premium' AND s.is_active) INTO v_is_premium
  FROM public.get_current_subscription_status(p_user_id) s;
  v_is_premium := coalesce(v_is_premium, false);

  v_allowed_genders := CASE lower(coalesce(v_self.preference, 'everyone'))
    WHEN 'male' THEN ARRAY['male']
    WHEN 'female' THEN ARRAY['female']
    ELSE ARRAY['male', 'female', 'other']
  END;
  v_min_age := coalesce(v_self.min_age, 18);
  v_max_age := coalesce(v_self.max_age, 99);
  v_max_distance_km := least(
    coalesce(v_self.max_distance, v_self.distance_preference, 50),
    CASE WHEN v_is_premium THEN 5000 ELSE 600 END
  );

  -- Hard exclusions only: yourself, blocks either way, active cooldowns.
  SELECT array_agg(DISTINCT x) INTO v_excluded_ids FROM (
    SELECT p_user_id AS x
    UNION SELECT blocked_id FROM public.blocks WHERE blocker_id = p_user_id AND blocked_id IS NOT NULL
    UNION SELECT blocker_id FROM public.blocks WHERE blocked_id = p_user_id AND blocker_id IS NOT NULL
    UNION SELECT CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
      FROM public.match_cooldowns
      WHERE (user1_id = p_user_id OR user2_id = p_user_id) AND expires_at > now()
  ) excluded(x);

  -- Soft exclusion: recently passed people don't come back as strangers,
  -- but they DO come back if you're already matched with them.
  SELECT array_agg(DISTINCT passed_id) INTO v_passed_ids
  FROM public.passes
  WHERE passer_id = p_user_id AND passed_at >= now() - interval '30 days' AND passed_id IS NOT NULL;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      cand.id AS cid,
      EXISTS (
        SELECT 1 FROM public.matches m
        WHERE (m.user1_id = p_user_id AND m.user2_id = cand.id)
           OR (m.user1_id = cand.id AND m.user2_id = p_user_id)
      ) AS matched,
      CASE
        WHEN v_self.latitude IS NULL OR v_self.longitude IS NULL
          OR cand.latitude IS NULL OR cand.longitude IS NULL THEN NULL
        ELSE round((6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(v_self.latitude)) * cos(radians(cand.latitude)) *
            cos(radians(cand.longitude) - radians(v_self.longitude)) +
            sin(radians(v_self.latitude)) * sin(radians(cand.latitude))
          ))
        ))::numeric, 0)
      END AS dist,
      (v_self.country_code IS NOT NULL AND v_self.country_code <> ''
        AND cand.country_code = v_self.country_code) AS same_country,
      (v_is_premium AND cand.country_code = ANY(coalesce(v_self.unlocked_countries, ARRAY[]::text[]))) AS unlocked
    FROM public.circle_up_queue q
    JOIN public.profiles cand ON cand.id = q.user_id
    WHERE q.status = 'waiting'
      AND q.updated_at > now() - interval '25 seconds'
      AND NOT (q.user_id = ANY(coalesce(v_excluded_ids, ARRAY[]::uuid[])))
      AND cand.account_status = 'active'
      AND cand.is_admin = false
      AND cand.gender = ANY(v_allowed_genders)
      AND (
        lower(coalesce(cand.preference, 'everyone')) IN ('everyone', 'both')
        OR v_self.gender IS NULL
        OR lower(cand.preference) = lower(v_self.gender)
      )
      AND (
        cand.date_of_birth IS NULL
        OR extract(year FROM age(cand.date_of_birth)) BETWEEN v_min_age AND v_max_age
      )
  ), tiered AS (
    SELECT
      cid,
      matched,
      dist,
      CASE
        WHEN same_country AND (dist IS NULL OR dist <= v_max_distance_km) THEN 0
        WHEN unlocked THEN 1
        WHEN same_country THEN 2
        ELSE 3
      END AS tier
    FROM eligible
  )
  SELECT
    t.cid,
    t.matched,
    CASE t.tier WHEN 0 THEN 'nearby' WHEN 1 THEN 'unlocked' WHEN 2 THEN 'national' ELSE 'abroad' END,
    t.dist
  FROM tiered t
  WHERE (
      -- Passed people only stay hidden while they're still strangers.
      t.matched OR NOT (t.cid = ANY(coalesce(v_passed_ids, ARRAY[]::uuid[])))
    )
    AND (
      (p_filter = 'matched' AND t.matched)
      OR (p_filter = 'not_matched' AND NOT t.matched)
      OR p_filter NOT IN ('matched', 'not_matched')
    )
  ORDER BY t.tier, random()
  LIMIT 40;
END;
$$;

GRANT EXECUTE ON FUNCTION public.circle_up_list_candidates(uuid, text) TO authenticated;