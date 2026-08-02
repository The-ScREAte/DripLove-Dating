-- SECURITY FIX: delete_user_and_data was SECURITY DEFINER with no ownership
-- check, so any authenticated user could pass an arbitrary user_id_to_delete
-- and permanently delete another user's account and all their data.
-- This adds the missing auth.uid() = user_id_to_delete check.
CREATE OR REPLACE FUNCTION public.delete_user_and_data(user_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != user_id_to_delete THEN
    RAISE EXCEPTION 'Not authorized to delete this account';
  END IF;

  -- Delete user images from storage and database
  DELETE FROM public.user_images WHERE user_id = user_id_to_delete;

  -- Delete chats where user is involved
  DELETE FROM public.chats WHERE sender_id = user_id_to_delete;

  -- Delete matches where user is involved
  DELETE FROM public.matches WHERE user1_id = user_id_to_delete OR user2_id = user_id_to_delete;

  -- Delete likes given and received by user
  DELETE FROM public.likes WHERE liker_id = user_id_to_delete OR liked_id = user_id_to_delete;

  -- Delete blocks involving user
  DELETE FROM public.blocks WHERE blocker_id = user_id_to_delete OR blocked_id = user_id_to_delete;

  -- Delete user profile
  DELETE FROM public.profiles WHERE id = user_id_to_delete;

  -- Finally delete the auth user (this will cascade to other tables if needed)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_user_and_data(uuid) TO authenticated;
