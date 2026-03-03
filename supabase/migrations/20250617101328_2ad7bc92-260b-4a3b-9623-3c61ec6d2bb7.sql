
-- Create a function to delete all user-related data
CREATE OR REPLACE FUNCTION delete_user_and_data(user_id_to_delete UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete user images from storage and database
  DELETE FROM user_images WHERE user_id = user_id_to_delete;
  
  -- Delete chats where user is involved
  DELETE FROM chats WHERE sender_id = user_id_to_delete;
  
  -- Delete matches where user is involved
  DELETE FROM matches WHERE user1_id = user_id_to_delete OR user2_id = user_id_to_delete;
  
  -- Delete likes given and received by user
  DELETE FROM likes WHERE liker_id = user_id_to_delete OR liked_id = user_id_to_delete;
  
  -- Delete blocks involving user
  DELETE FROM blocks WHERE blocker_id = user_id_to_delete OR blocked_id = user_id_to_delete;
  
  -- Delete user profile
  DELETE FROM profiles WHERE id = user_id_to_delete;
  
  -- Finally delete the auth user (this will cascade to other tables if needed)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$;

-- Grant execute permission to authenticated users (they can only delete their own account)
GRANT EXECUTE ON FUNCTION delete_user_and_data(UUID) TO authenticated;
;
