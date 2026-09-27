-- Lets a user choose, on the Prepare screen, which common profile fields
-- (age, location/distance, interests) their Circle Up match actually sees.
-- Read by the OTHER side's client once matched, so it needs to be visible
-- cross-user for exactly the two people paired in an active session - not
-- world-readable, and not visible before a match exists.

ALTER TABLE public.circle_up_queue
  ADD COLUMN IF NOT EXISTS share_settings jsonb NOT NULL DEFAULT '{"age":true,"location":true,"interests":true}'::jsonb;

CREATE POLICY circle_up_queue_matched_partner_select ON public.circle_up_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_up_sessions s
      WHERE s.status IN ('pending_accept', 'accepted')
        AND (
          (s.user_a = auth.uid() AND s.user_b = circle_up_queue.user_id)
          OR (s.user_b = auth.uid() AND s.user_a = circle_up_queue.user_id)
        )
    )
  );
