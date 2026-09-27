-- Circle Up: live 1:1 video matching. Two new tables plus a matching
-- function that reuses the exact same preference/exclusion rules already
-- proven for Discover/Circle (get_random_discover_profiles, Circle's
-- fetchCircleExclusionIds, and the reciprocal-preference check in
-- src/components/discover/discoverFeedUtils.ts), just restricted to the
-- small pool of users currently "Ready" instead of the whole eligible pool.

-- One row per user currently waiting to be matched. PRIMARY KEY on user_id
-- means a user can only ever have one active queue entry - going "Ready"
-- again just replaces it (upsert).
CREATE TABLE IF NOT EXISTS public.circle_up_queue (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled')),
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per candidate pairing. Both sides record their own decision
-- independently; the call only starts once both are 'accept'.
CREATE TABLE IF NOT EXISTS public.circle_up_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_a_decision text NOT NULL DEFAULT 'pending' CHECK (user_a_decision IN ('pending', 'accept', 'pass')),
  user_b_decision text NOT NULL DEFAULT 'pending' CHECK (user_b_decision IN ('pending', 'accept', 'pass')),
  status text NOT NULL DEFAULT 'pending_accept' CHECK (status IN ('pending_accept', 'accepted', 'declined', 'ended')),
  livekit_room_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_reason text
);

ALTER TABLE public.circle_up_queue
  ADD CONSTRAINT circle_up_queue_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.circle_up_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS circle_up_queue_status_idx ON public.circle_up_queue (status);
CREATE INDEX IF NOT EXISTS circle_up_sessions_user_a_idx ON public.circle_up_sessions (user_a);
CREATE INDEX IF NOT EXISTS circle_up_sessions_user_b_idx ON public.circle_up_sessions (user_b);

ALTER TABLE public.circle_up_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_up_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY circle_up_queue_own_row ON public.circle_up_queue
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY circle_up_sessions_participant_select ON public.circle_up_sessions
  FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY circle_up_sessions_participant_update ON public.circle_up_sessions
  FOR UPDATE
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- Matching function: SECURITY DEFINER so it can read both users' full
-- profile rows (age/preference/location) regardless of RLS, same pattern
-- as get_random_discover_profiles. Picks ONE eligible waiting candidate,
-- locking the queue row (FOR UPDATE SKIP LOCKED) so two simultaneous
-- callers can never pair with the same candidate twice.
CREATE OR REPLACE FUNCTION public.circle_up_find_match(p_user_id uuid)
RETURNS TABLE(session_id uuid, matched_user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_self public.profiles;
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

  v_allowed_genders := CASE lower(coalesce(v_self.preference, 'everyone'))
    WHEN 'male' THEN ARRAY['male']
    WHEN 'female' THEN ARRAY['female']
    ELSE ARRAY['male', 'female', 'other']
  END;
  v_min_age := coalesce(v_self.min_age, 18);
  v_max_age := coalesce(v_self.max_age, 99);
  v_max_distance_km := coalesce(v_self.max_distance, v_self.distance_preference, 50);

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

  -- Pick one eligible, currently-waiting candidate. FOR UPDATE SKIP LOCKED
  -- on the queue row means a second concurrent caller simply skips anyone
  -- another caller is already in the middle of pairing with.
  SELECT q.user_id INTO v_candidate_id
  FROM public.circle_up_queue q
  JOIN public.profiles cand ON cand.id = q.user_id
  WHERE q.status = 'waiting'
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

GRANT EXECUTE ON FUNCTION public.circle_up_find_match(uuid) TO authenticated;
