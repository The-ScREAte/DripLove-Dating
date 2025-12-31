-- Saved broadcast messages in user Profile (no new tables)
--
-- Adds:
-- - broadcast_campaigns.save_to_profile: whether this broadcast should appear in users' Profile inbox
-- - broadcast_recipients.profile_read_at: when user viewed the inbox message
-- - broadcast_recipients.profile_deleted_at: user removed it from inbox
--
-- Also provides small RPC helpers so the client can safely:
-- - list messages
-- - count unread
-- - mark as read
-- - delete a message

ALTER TABLE public.broadcast_campaigns
ADD COLUMN IF NOT EXISTS save_to_profile BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.broadcast_recipients
ADD COLUMN IF NOT EXISTS profile_read_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS profile_deleted_at TIMESTAMPTZ;

-- Helpful indexes for per-user inbox queries
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_profile_inbox
ON public.broadcast_recipients (user_id, profile_deleted_at, profile_read_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_save_to_profile
ON public.broadcast_campaigns (save_to_profile, created_at);

-- List messages in the current user's inbox
CREATE OR REPLACE FUNCTION public.get_my_profile_broadcast_messages(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  recipient_id UUID,
  campaign_id UUID,
  title TEXT,
  message TEXT,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  profile_read_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id AS recipient_id,
    c.id AS campaign_id,
    c.title,
    c.message,
    c.created_at,
    r.sent_at,
    r.profile_read_at
  FROM public.broadcast_recipients r
  JOIN public.broadcast_campaigns c
    ON c.id = r.campaign_id
  WHERE r.user_id = auth.uid()
    AND c.save_to_profile = TRUE
    AND r.profile_deleted_at IS NULL
  ORDER BY c.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200))
  OFFSET GREATEST(0, p_offset);
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_broadcast_messages(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_broadcast_messages(INT, INT) TO authenticated;

-- Unread count
CREATE OR REPLACE FUNCTION public.get_my_profile_broadcast_unread_count()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::INT
  FROM public.broadcast_recipients r
  JOIN public.broadcast_campaigns c
    ON c.id = r.campaign_id
  WHERE r.user_id = auth.uid()
    AND c.save_to_profile = TRUE
    AND r.profile_deleted_at IS NULL
    AND r.profile_read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_broadcast_unread_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_broadcast_unread_count() TO authenticated;

-- Mark all inbox messages as read
CREATE OR REPLACE FUNCTION public.mark_my_profile_broadcasts_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.broadcast_recipients r
  SET profile_read_at = now()
  FROM public.broadcast_campaigns c
  WHERE c.id = r.campaign_id
    AND r.user_id = auth.uid()
    AND c.save_to_profile = TRUE
    AND r.profile_deleted_at IS NULL
    AND r.profile_read_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_profile_broadcasts_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_my_profile_broadcasts_read() TO authenticated;

-- "Delete" (hide) one inbox message for current user
CREATE OR REPLACE FUNCTION public.delete_my_profile_broadcast_message(
  p_recipient_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.broadcast_recipients
  SET profile_deleted_at = now()
  WHERE id = p_recipient_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_profile_broadcast_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_profile_broadcast_message(UUID) TO authenticated;
