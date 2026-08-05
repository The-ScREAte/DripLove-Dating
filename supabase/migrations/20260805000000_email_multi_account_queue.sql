-- Tracks how many emails each SMTP sending account has sent today, so the sender
-- can rotate to the next account once one hits its daily provider quota (e.g. Gmail's 500/day).
CREATE TABLE IF NOT EXISTS public.email_account_usage (
    account_email TEXT NOT NULL,
    send_date DATE NOT NULL,
    sent_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_email, send_date)
);

ALTER TABLE public.email_account_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email account usage"
ON public.email_account_usage
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);

-- Atomically increments today's usage for an account and returns the new count.
-- Used by the SMTP sender so concurrent sends can't both think they have quota left.
CREATE OR REPLACE FUNCTION public.increment_email_account_usage(p_account_email TEXT, p_amount INTEGER DEFAULT 1)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO public.email_account_usage (account_email, send_date, sent_count)
  VALUES (p_account_email, CURRENT_DATE, p_amount)
  ON CONFLICT (account_email, send_date)
  DO UPDATE SET sent_count = email_account_usage.sent_count + p_amount
  RETURNING sent_count INTO new_count;

  RETURN new_count;
END;
$$;

-- Recipients that couldn't be sent because every account was out of daily quota.
-- Picked back up automatically by process-email-queue once quota frees up.
CREATE TABLE IF NOT EXISTS public.email_send_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    broadcast_id UUID NOT NULL REFERENCES public.email_broadcast_history(id) ON DELETE CASCADE,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_send_queue_pending
ON public.email_send_queue(status, broadcast_id)
WHERE status = 'pending';

ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email send queue"
ON public.email_send_queue
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);

CREATE POLICY "Admins can delete email send queue"
ON public.email_send_queue
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);
