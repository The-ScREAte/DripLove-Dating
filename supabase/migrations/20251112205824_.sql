-- Add dormancy tracking columns to matches table
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS dormancy_check_asked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS user1_heading_somewhere BOOLEAN,
ADD COLUMN IF NOT EXISTS user2_heading_somewhere BOOLEAN;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_matches_first_message_at ON matches(first_message_at);
CREATE INDEX IF NOT EXISTS idx_matches_dormancy_check ON matches(dormancy_check_asked_at);

-- Create function to update first_message_at when first message is sent
CREATE OR REPLACE FUNCTION update_first_message_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only update if first_message_at is NULL (first message)
  UPDATE matches
  SET first_message_at = NEW.created_at
  WHERE id = NEW.match_id
  AND first_message_at IS NULL;
  
  RETURN NEW;
END;
$$;

-- Create trigger to track first message
DROP TRIGGER IF EXISTS track_first_message ON chats;
CREATE TRIGGER track_first_message
AFTER INSERT ON chats
FOR EACH ROW
EXECUTE FUNCTION update_first_message_timestamp();

COMMENT ON COLUMN matches.first_message_at IS 'Timestamp of the first message sent in this match';
COMMENT ON COLUMN matches.dormancy_check_asked_at IS 'Timestamp when we asked users if they are heading somewhere';
COMMENT ON COLUMN matches.user1_heading_somewhere IS 'User1 response: true=yes, false=no, null=not answered';
COMMENT ON COLUMN matches.user2_heading_somewhere IS 'User2 response: true=yes, false=no, null=not answered';;
