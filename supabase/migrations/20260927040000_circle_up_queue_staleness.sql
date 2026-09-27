-- Circle Up: a queue row was only ever written once, when the user first
-- hits Ready (CircleUpPrepare's upsert) or resets after a pass
-- (resetOwnQueueAndSearch) - polling itself never touched updated_at again.
-- So anyone who left the matching screen without a clean Cancel (app kill,
-- back-swipe, lost connection) stayed 'waiting' forever, a ghost candidate
-- that could get matched against by someone else's real, live search at any
-- point later - producing exactly the "went searching, found no one, no
-- session ever created" symptom, since a ghost consumed the pairing.
--
-- Fix: every poll now heartbeats the caller's own row (updated_at = now()),
-- and the candidate search ignores any row not heartbeated recently. 20s
-- comfortably covers the 2.5s client poll interval plus network latency.
CREATE OR REPLACE FUNCTION public.circle_up_find_match(p_user_id uuid)
RETURNS TABLE(session_id uuid, matched_user_id uuid)
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
  v_candidate_id uuid;
  v_session_id uuid;
BEGIN
  SELECT * INTO v_self FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Heartbeat: only touches a row that's still genuinely 'waiting' (a
  -- 'matched' row must keep its updated_at from the match itself, not get
  -- overwritten here).
  UPDATE public.circle_up_queue
  SET updated_at = now()
  WHERE user_id = p_user_id AND status = 'waiting';

  -- If someone else's call already picked the caller as THEIR candidate
  -- (flipping the caller's own queue row to 'matched' from the other
  -- side), just hand back that existing session instead of searching for
  -- a new one - otherwise a client that's still polling while it's being
  -- selected elsewhere could get double-booked into two sessions at once.
  SELECT circle_up_queue.session_id INTO v_session_id
  FROM public.circle_up_queue
  WHERE user_id = p_user_id AND status = 'matched' AND circle_up_queue.session_id IS NOT NULL;

  IF v_session_id IS NOT NULL THEN
    SELECT CASE WHEN user_a = p_user_id THEN user_b ELSE user_a END INTO v_candidate_id
    FROM public.circle_up_sessions WHERE id = v_session_id;
    RETURN QUERY SELECT v_session_id, v_candidate_id;
    RETURN;
  END IF;

  -- Same premium check the rest of the app uses (get_current_subscription_status,
  -- src/hooks/useEnhancedSubscription.ts). Drives the exact same home-country
  -- (distance-bound) vs. unlocked-countries (not distance-bound) split
  -- Discover/Circle already implement (getCircleDistanceParams/
  -- getCircleCountrySplit in src/utils/circlePoolFetch.ts) - without this, a
  -- premium user who explicitly unlocked another country still couldn't
  -- Circle Up with anyone there, only with people literally near them.
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
  -- Same cap Circle/Discover apply: your own distance setting, capped at
  -- 600km free / 5000km premium - only meaningful within your home country
  -- (see the WHERE clause below); unlocked countries ignore it entirely.
  v_max_distance_km := least(
    coalesce(v_self.max_distance, v_self.distance_preference, 50),
    CASE WHEN v_is_premium THEN 5000 ELSE 600 END
  );

  -- Same exclusion rules as fetchCircleExclusionIds (src/utils/circlePoolFetch.ts):
  -- liked/passed-in-last-30-days by me, matched with me, blocked either
  -- direction, or under an active cooldown with me.
  SELECT array_agg(DISTINCT x) INTO v_excluded_ids FROM (
    SELECT p_user_id AS x
    UNION SELECT liked_id FROM public.likes WHERE liker_id = p_user_id
    UNION SELECT passed_id FROM public.passes WHERE passer_id = p_user_id AND passed_at >= now() - interval '30 days'
    UNION SELECT CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
      FROM public.matches WHERE user1_id = p_user_id OR user2_id = p_user_id
    UNION SELECT blocked_id FROM public.blocks WHERE blocker_id = p_user_id AND blocked_id IS NOT NULL
    UNION SELECT blocker_id FROM public.blocks WHERE blocked_id = p_user_id AND blocker_id IS NOT NULL
    UNION SELECT CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
      FROM public.match_cooldowns
      WHERE (user1_id = p_user_id OR user2_id = p_user_id) AND expires_at > now()
  ) excluded(x);

  -- Pick one eligible, currently-waiting, recently-heartbeated candidate.
  -- FOR UPDATE SKIP LOCKED on the queue row means a second concurrent
  -- caller simply skips anyone another caller is already in the middle of
  -- pairing with.
  SELECT q.user_id INTO v_candidate_id
  FROM public.circle_up_queue q
  JOIN public.profiles cand ON cand.id = q.user_id
  WHERE q.status = 'waiting'
    AND q.updated_at > now() - interval '20 seconds'
    AND NOT (q.user_id = ANY(coalesce(v_excluded_ids, ARRAY[]::uuid[])))
    AND cand.account_status = 'active'
    AND cand.is_admin = false
    AND cand.gender = ANY(v_allowed_genders)
    -- reciprocal check, both directions (matchesReciprocalPreference semantics):
    AND (
      lower(coalesce(cand.preference, 'everyone')) IN ('everyone', 'both')
      OR v_self.gender IS NULL
      OR lower(cand.preference) = lower(v_self.gender)
    )
    AND (
      v_self.preference IS NULL
      OR lower(v_self.preference) IN ('everyone', 'both')
      OR cand.gender IS NULL
      OR lower(v_self.preference) = lower(cand.gender)
    )
    AND (
      cand.date_of_birth IS NULL
      OR extract(year FROM age(cand.date_of_birth)) BETWEEN v_min_age AND v_max_age
    )
    AND (
      -- Home country: distance-bound, same as before.
      (
        v_self.country_code IS NOT NULL AND v_self.country_code <> ''
        AND cand.country_code = v_self.country_code
        AND (
          v_self.latitude IS NULL OR v_self.longitude IS NULL
          OR cand.latitude IS NULL OR cand.longitude IS NULL
          OR (
            6371 * acos(
              least(1.0, greatest(-1.0,
                cos(radians(v_self.latitude)) * cos(radians(cand.latitude)) *
                cos(radians(cand.longitude) - radians(v_self.longitude)) +
                sin(radians(v_self.latitude)) * sin(radians(cand.latitude))
              ))
            )
          ) <= v_max_distance_km
        )
      )
      -- Premium: also reachable in any country they've explicitly
      -- unlocked, with no distance bound at all - this is exactly why a
      -- premium user with an unlocked country still couldn't find anyone
      -- there before this existed.
      OR (v_is_premium AND cand.country_code = ANY(coalesce(v_self.unlocked_countries, ARRAY[]::text[])))
    )
  ORDER BY random()
  LIMIT 1
  FOR UPDATE OF q SKIP LOCKED;

  IF v_candidate_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.circle_up_sessions (user_a, user_b)
  VALUES (p_user_id, v_candidate_id)
  RETURNING id INTO v_session_id;

  UPDATE public.circle_up_queue
  SET status = 'matched', session_id = v_session_id, updated_at = now()
  WHERE user_id IN (p_user_id, v_candidate_id);

  RETURN QUERY SELECT v_session_id, v_candidate_id;
END;
$$;
