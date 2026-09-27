-- Circle Up: replace blind random auto-pairing with a browsable "who's
-- available right now" grid. circle_up_find_match used to silently pick ONE
-- random eligible candidate for you - live testing showed this feels broken
-- ("Circling now..." spins forever) even when eligible people genuinely are
-- waiting, because there's nothing to actually look at. Split into three
-- functions instead:
--   - circle_up_list_candidates: read-only listing of everyone eligible,
--     filterable by existing-match status (previously a hard exclusion,
--     now user-controlled).
--   - circle_up_request_session: explicit "I pick this person" action.
--   - circle_up_check_session: the old fast-path-only check, so a user
--     sitting in the browse grid still gets pulled in the instant someone
--     else picks THEM.
-- circle_up_find_match itself is left in place, unused, rather than
-- dropped - no client calls it anymore after this migration's paired
-- CircleUpMatching.tsx change, but nothing risks breaking by leaving it.

CREATE OR REPLACE FUNCTION public.circle_up_list_candidates(p_user_id uuid, p_filter text DEFAULT 'everyone')
RETURNS TABLE(candidate_id uuid, is_matched boolean)
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
BEGIN
  SELECT * INTO v_self FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Heartbeat the caller's own row too, same as circle_up_find_match did -
  -- browsing the grid should keep you visible to everyone else's grid.
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

  -- Same exclusion rules as circle_up_find_match EXCEPT matches - being
  -- already matched with someone in Discover no longer hides them here,
  -- it's surfaced instead via the is_matched column so the client can
  -- filter on it.
  SELECT array_agg(DISTINCT x) INTO v_excluded_ids FROM (
    SELECT p_user_id AS x
    UNION SELECT liked_id FROM public.likes WHERE liker_id = p_user_id
    UNION SELECT passed_id FROM public.passes WHERE passer_id = p_user_id AND passed_at >= now() - interval '30 days'
    UNION SELECT blocked_id FROM public.blocks WHERE blocker_id = p_user_id AND blocked_id IS NOT NULL
    UNION SELECT blocker_id FROM public.blocks WHERE blocked_id = p_user_id AND blocker_id IS NOT NULL
    UNION SELECT CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
      FROM public.match_cooldowns
      WHERE (user1_id = p_user_id OR user2_id = p_user_id) AND expires_at > now()
  ) excluded(x);

  RETURN QUERY
  SELECT
    cand.id,
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE (m.user1_id = p_user_id AND m.user2_id = cand.id)
         OR (m.user1_id = cand.id AND m.user2_id = p_user_id)
    ) AS is_matched
  FROM public.circle_up_queue q
  JOIN public.profiles cand ON cand.id = q.user_id
  WHERE q.status = 'waiting'
    AND q.updated_at > now() - interval '20 seconds'
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
      OR (v_is_premium AND cand.country_code = ANY(coalesce(v_self.unlocked_countries, ARRAY[]::text[])))
    )
    AND (
      p_filter = 'matched' AND EXISTS (
        SELECT 1 FROM public.matches m
        WHERE (m.user1_id = p_user_id AND m.user2_id = cand.id)
           OR (m.user1_id = cand.id AND m.user2_id = p_user_id)
      )
      OR p_filter = 'not_matched' AND NOT EXISTS (
        SELECT 1 FROM public.matches m
        WHERE (m.user1_id = p_user_id AND m.user2_id = cand.id)
           OR (m.user1_id = cand.id AND m.user2_id = p_user_id)
      )
      OR p_filter NOT IN ('matched', 'not_matched')
    )
  ORDER BY random()
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.circle_up_list_candidates(uuid, text) TO authenticated;

-- Explicit "I pick this person" action - the browse-grid equivalent of what
-- circle_up_find_match used to do randomly. Locks both queue rows in a
-- fixed order (by user_id) so two people tapping each other at the same
-- instant can never deadlock.
CREATE OR REPLACE FUNCTION public.circle_up_request_session(p_user_id uuid, p_target_id uuid)
RETURNS TABLE(session_id uuid, matched_user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_id uuid;
  v_candidate_id uuid;
  v_first uuid;
  v_second uuid;
  v_target_status text;
  v_target_updated_at timestamptz;
  v_blocked boolean;
BEGIN
  IF p_target_id IS NULL OR p_target_id = p_user_id THEN
    RETURN;
  END IF;

  -- Fast-path: someone else already grabbed the caller while they were
  -- browsing - hand back that session instead of processing this tap.
  SELECT circle_up_queue.session_id INTO v_session_id
  FROM public.circle_up_queue
  WHERE user_id = p_user_id AND status = 'matched' AND circle_up_queue.session_id IS NOT NULL;

  IF v_session_id IS NOT NULL THEN
    SELECT CASE WHEN user_a = p_user_id THEN user_b ELSE user_a END INTO v_candidate_id
    FROM public.circle_up_sessions WHERE id = v_session_id;
    RETURN QUERY SELECT v_session_id, v_candidate_id;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = p_user_id AND blocked_id = p_target_id)
       OR (blocker_id = p_target_id AND blocked_id = p_user_id)
  ) INTO v_blocked;
  IF v_blocked THEN
    RETURN;
  END IF;

  -- Lock in a fixed order regardless of who's calling, so a simultaneous
  -- cross-request (A picks B at the same instant B picks A) always
  -- acquires the two row locks in the same order and never deadlocks.
  IF p_user_id < p_target_id THEN
    v_first := p_user_id; v_second := p_target_id;
  ELSE
    v_first := p_target_id; v_second := p_user_id;
  END IF;

  PERFORM 1 FROM public.circle_up_queue WHERE user_id = v_first FOR UPDATE;
  PERFORM 1 FROM public.circle_up_queue WHERE user_id = v_second FOR UPDATE;

  -- Re-check the caller's own row after acquiring locks - another request
  -- could have matched them in the gap between the fast-path check above
  -- and now.
  SELECT circle_up_queue.session_id INTO v_session_id
  FROM public.circle_up_queue
  WHERE user_id = p_user_id AND status = 'matched' AND circle_up_queue.session_id IS NOT NULL;

  IF v_session_id IS NOT NULL THEN
    SELECT CASE WHEN user_a = p_user_id THEN user_b ELSE user_a END INTO v_candidate_id
    FROM public.circle_up_sessions WHERE id = v_session_id;
    RETURN QUERY SELECT v_session_id, v_candidate_id;
    RETURN;
  END IF;

  SELECT status, updated_at INTO v_target_status, v_target_updated_at
  FROM public.circle_up_queue WHERE user_id = p_target_id;

  IF v_target_status IS DISTINCT FROM 'waiting' OR v_target_updated_at IS NULL
     OR v_target_updated_at <= now() - interval '20 seconds' THEN
    -- Target is no longer available (left, got picked by someone else
    -- first, or gone stale) - client shows "no longer available" and
    -- refreshes the grid.
    RETURN;
  END IF;

  INSERT INTO public.circle_up_sessions (user_a, user_b)
  VALUES (p_user_id, p_target_id)
  RETURNING id INTO v_session_id;

  UPDATE public.circle_up_queue
  SET status = 'matched', session_id = v_session_id, updated_at = now()
  WHERE user_id IN (p_user_id, p_target_id);

  RETURN QUERY SELECT v_session_id, p_target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.circle_up_request_session(uuid, uuid) TO authenticated;

-- The old fast-path-only check, split out on its own so a user sitting in
-- the browse grid (not actively randomizing) still gets pulled into the
-- reveal the instant someone else's circle_up_request_session picks them.
CREATE OR REPLACE FUNCTION public.circle_up_check_session(p_user_id uuid)
RETURNS TABLE(session_id uuid, matched_user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_id uuid;
  v_candidate_id uuid;
BEGIN
  UPDATE public.circle_up_queue
  SET updated_at = now()
  WHERE user_id = p_user_id AND status = 'waiting';

  SELECT circle_up_queue.session_id INTO v_session_id
  FROM public.circle_up_queue
  WHERE user_id = p_user_id AND status = 'matched' AND circle_up_queue.session_id IS NOT NULL;

  IF v_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT CASE WHEN user_a = p_user_id THEN user_b ELSE user_a END INTO v_candidate_id
  FROM public.circle_up_sessions WHERE id = v_session_id;

  RETURN QUERY SELECT v_session_id, v_candidate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.circle_up_check_session(uuid) TO authenticated;
