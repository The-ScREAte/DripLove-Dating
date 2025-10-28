-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS admin_create_match(uuid, uuid);

-- Create the admin_create_match function with proper column references
CREATE OR REPLACE FUNCTION admin_create_match(
  user1_id uuid,
  user2_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_match uuid;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can create manual matches';
  END IF;

  -- Check if match already exists (in either direction)
  SELECT matches.id INTO v_existing_match
  FROM matches
  WHERE (matches.user1_id = user1_id AND matches.user2_id = user2_id)
     OR (matches.user1_id = user2_id AND matches.user2_id = user1_id);

  IF v_existing_match IS NOT NULL THEN
    RAISE EXCEPTION 'Match already exists between these users';
  END IF;

  -- Check if either user has blocked the other
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocks.blocker_id = user1_id AND blocks.blocked_id = user2_id)
       OR (blocks.blocker_id = user2_id AND blocks.blocked_id = user1_id)
  ) THEN
    RAISE EXCEPTION 'Cannot create match - one user has blocked the other';
  END IF;

  -- Create the match
  INSERT INTO matches (user1_id, user2_id, created_at, user1_unread_count, user2_unread_count)
  VALUES (user1_id, user2_id, now(), 0, 0);

  -- Create mutual likes if they don't exist
  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (user1_id, user2_id, now())
  ON CONFLICT DO NOTHING;

  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (user2_id, user1_id, now())
  ON CONFLICT DO NOTHING;

END;
$$;