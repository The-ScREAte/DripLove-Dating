-- Drop and recreate admin_create_match with proper parameter naming
DROP FUNCTION IF EXISTS admin_create_match(uuid, uuid);

CREATE OR REPLACE FUNCTION admin_create_match(
  p_user1_id uuid,
  p_user2_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_match uuid;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can create manual matches';
  END IF;

  -- Check if match already exists (in either direction)
  SELECT id INTO v_existing_match
  FROM matches
  WHERE (user1_id = p_user1_id AND user2_id = p_user2_id)
     OR (user1_id = p_user2_id AND user2_id = p_user1_id);

  IF v_existing_match IS NOT NULL THEN
    RAISE EXCEPTION 'Match already exists between these users';
  END IF;

  -- Check if either user has blocked the other
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = p_user1_id AND blocked_id = p_user2_id)
       OR (blocker_id = p_user2_id AND blocked_id = p_user1_id)
  ) THEN
    RAISE EXCEPTION 'Cannot create match - one user has blocked the other';
  END IF;

  -- Create the match
  INSERT INTO matches (user1_id, user2_id, created_at, user1_unread_count, user2_unread_count)
  VALUES (p_user1_id, p_user2_id, now(), 0, 0);

  -- Create mutual likes if they don't exist
  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (p_user1_id, p_user2_id, now())
  ON CONFLICT DO NOTHING;

  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (p_user2_id, p_user1_id, now())
  ON CONFLICT DO NOTHING;

END;
$$;