-- FIX: Broadcast emails were being retried forever for permanently-bad addresses.
--
-- Recurring broadcasts (process-scheduled-broadcasts) re-fetch the FULL eligible
-- audience on every run (daily/weekly/etc.) and hand it to send-broadcast-email-smtp,
-- which has no memory of which addresses previously hard-bounced. So an address that
-- doesn't exist gets re-attempted on every single broadcast, forever -- wasting daily
-- SMTP account quota on addresses that can never succeed.
--
-- This table is a permanent registry of addresses that failed with a PERMANENT reason
-- (hard bounce / mailbox doesn't exist / invalid recipient -- SMTP 5xx), checked and
-- populated by send-broadcast-email-smtp and process-email-queue before/after sending.
-- It intentionally does NOT include quota errors (that's the sending account's fault,
-- not the recipient's) or transient 4xx errors (temporary mailbox/server issues, which
-- deserve to be retried on the next distinct campaign).

CREATE TABLE IF NOT EXISTS public.email_suppression_list (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  last_error TEXT,
  broadcast_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email suppression list"
ON public.email_suppression_list
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);
-- No client INSERT/UPDATE/DELETE policy: only the SMTP-sending edge functions
-- (service role, bypasses RLS) write to this table.
