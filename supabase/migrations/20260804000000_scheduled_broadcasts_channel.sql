-- Scheduled broadcasts can now be either a push notification or an email.
-- title/message are reused as-is: for email, title = subject and message = HTML body.
ALTER TABLE public.scheduled_broadcasts
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'email'));
