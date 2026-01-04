-- Drop and recreate get_my_profile_broadcast_messages with correct return type
DROP FUNCTION IF EXISTS public.get_my_profile_broadcast_messages(integer, integer);

CREATE OR REPLACE FUNCTION public.get_my_profile_broadcast_messages(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  recipient_id uuid,
  campaign_id uuid,
  title text,
  message text,
  sent_at timestamptz,
  created_at timestamptz,
  profile_read_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    br.id as recipient_id,
    br.campaign_id,
    bc.title,
    bc.message,
    br.sent_at,
    br.created_at,
    br.profile_read_at
  FROM broadcast_recipients br
  JOIN broadcast_campaigns bc ON br.campaign_id = bc.id
  WHERE br.user_id = auth.uid()
    AND br.status = 'sent'
    AND bc.save_to_profile = true
    AND br.profile_deleted_at IS NULL
  ORDER BY br.sent_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Update mark function to return correct type
CREATE OR REPLACE FUNCTION public.mark_my_profile_broadcasts_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH updated AS (
    UPDATE broadcast_recipients br
    SET profile_read_at = now()
    FROM broadcast_campaigns bc
    WHERE br.campaign_id = bc.id
      AND br.user_id = auth.uid()
      AND br.status = 'sent'
      AND bc.save_to_profile = true
      AND br.profile_read_at IS NULL
      AND br.profile_deleted_at IS NULL
    RETURNING br.id
  )
  SELECT COUNT(*)::integer INTO updated_count FROM updated;
  
  RETURN COALESCE(updated_count, 0);
END;
$$;

-- Update unread count function
CREATE OR REPLACE FUNCTION public.get_my_profile_broadcast_unread_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unread_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO unread_count
  FROM broadcast_recipients br
  JOIN broadcast_campaigns bc ON br.campaign_id = bc.id
  WHERE br.user_id = auth.uid()
    AND br.status = 'sent'
    AND bc.save_to_profile = true
    AND br.profile_read_at IS NULL
    AND br.profile_deleted_at IS NULL;
  
  RETURN COALESCE(unread_count, 0);
END;
$$;