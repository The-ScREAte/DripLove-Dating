-- Update admin_create_match to send normal match notifications to both users
DROP FUNCTION IF EXISTS admin_create_match(uuid, uuid);

CREATE OR REPLACE FUNCTION admin_create_match(
  p_user1_id uuid,
  p_user2_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_match uuid;
  v_match_id uuid;
  v_is_admin boolean;
  v_user1_name text;
  v_user2_name text;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO v_is_admin
  FROM profiles 
  WHERE id = auth.uid();
  
  IF v_is_admin IS NULL OR v_is_admin = false THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only admins can create manual matches'
    );
  END IF;

  -- Validate that user1_id is not equal to user2_id FIRST
  IF p_user1_id = p_user2_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot match a user with themselves. User IDs are identical.'
    );
  END IF;

  -- Validate that both users exist and get their names
  SELECT first_name INTO v_user1_name
  FROM profiles WHERE id = p_user1_id;
  
  IF v_user1_name IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User 1 not found (ID: ' || p_user1_id::text || ')'
    );
  END IF;

  SELECT first_name INTO v_user2_name
  FROM profiles WHERE id = p_user2_id;
  
  IF v_user2_name IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User 2 not found (ID: ' || p_user2_id::text || ')'
    );
  END IF;

  -- Check if match already exists (in either direction)
  SELECT id INTO v_existing_match
  FROM matches
  WHERE (user1_id = p_user1_id AND user2_id = p_user2_id)
     OR (user1_id = p_user2_id AND user2_id = p_user1_id);

  IF v_existing_match IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Match already exists between ' || v_user1_name || ' and ' || v_user2_name
    );
  END IF;

  -- Check if either user has blocked the other
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = p_user1_id AND blocked_id = p_user2_id)
       OR (blocker_id = p_user2_id AND blocked_id = p_user1_id)
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot create match - one user has blocked the other'
    );
  END IF;

  -- Create the match
  INSERT INTO matches (user1_id, user2_id, created_at, user1_unread_count, user2_unread_count)
  VALUES (p_user1_id, p_user2_id, now(), 0, 0)
  RETURNING id INTO v_match_id;

  -- Create mutual likes if they don't exist
  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (p_user1_id, p_user2_id, now())
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (p_user2_id, p_user1_id, now())
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  -- Send normal match notification to user1 (about user2)
  INSERT INTO notifications (user_id, type, title, message, related_user_id, is_read)
  VALUES (
    p_user1_id,
    'match',
    'New Match!',
    'You matched with ' || v_user2_name || '! Start chatting now.',
    p_user2_id,
    false
  );

  -- Send normal match notification to user2 (about user1)
  INSERT INTO notifications (user_id, type, title, message, related_user_id, is_read)
  VALUES (
    p_user2_id,
    'match',
    'New Match!',
    'You matched with ' || v_user1_name || '! Start chatting now.',
    p_user1_id,
    false
  );

  -- Return success with details
  RETURN json_build_object(
    'success', true,
    'match_id', v_match_id,
    'message', 'Match created successfully between ' || v_user1_name || ' and ' || v_user2_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_match(uuid, uuid) TO authenticated;