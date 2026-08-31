-- FIX: rate-limited/temporarily-failed broadcast emails had no retry path.
--
-- send-broadcast-email-smtp and process-email-queue both wrote a recipient
-- straight to a permanent 'failed' state the moment a single send attempt
-- returned a transient error (Gmail rate-limiting, "421 Temporary System
-- Problem", etc.) -- indistinguishable from a real hard bounce once it hit
-- email_broadcast_history.error_details / email_send_queue.status='failed'.
-- Only recipients that were never attempted at all (no account had capacity
-- left) ever made it back into the pending queue for a later run to pick up.
--
-- This column lets both functions safely put a transient failure BACK to
-- 'pending' instead of 'failed', so process-email-queue's next run retries
-- it automatically once any account has quota again -- while still capping
-- retries so a recipient that keeps transient-failing forever doesn't loop
-- indefinitely and burn quota every day.
ALTER TABLE public.email_send_queue
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.email_send_queue.attempt_count IS
  'Number of send attempts made so far. A transient failure increments this and resets status back to pending for automatic retry; once it exceeds the caller''s max-attempts cap the row is left failed instead of retried forever.';
