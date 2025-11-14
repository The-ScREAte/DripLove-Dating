-- Fix the trigger function that's causing "relation matches does not exist" error
-- The issue is that SET search_path = '' removes access to the public schema

DROP TRIGGER IF EXISTS track_first_message ON chats;
DROP FUNCTION IF EXISTS update_first_message_timestamp();

-- Recreate function with correct search_path
CREATE OR REPLACE FUNCTION update_first_message_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only update if first_message_at is NULL (first message)
  UPDATE public.matches
  SET first_message_at = NEW.created_at
  WHERE id = NEW.match_id
  AND first_message_at IS NULL;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER track_first_message
AFTER INSERT ON public.chats
FOR EACH ROW
EXECUTE FUNCTION update_first_message_timestamp();
