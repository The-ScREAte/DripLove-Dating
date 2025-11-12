-- Allow users to delete their own matches
CREATE POLICY "Users can delete their own matches"
ON public.matches
FOR DELETE
USING (
  auth.uid() = user1_id OR auth.uid() = user2_id
);

-- Create function to delete match and related chats
CREATE OR REPLACE FUNCTION delete_match_with_chats(match_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Delete all chats related to this match
  DELETE FROM public.chats WHERE match_id = match_id_param;
  
  -- Delete the match
  DELETE FROM public.matches WHERE id = match_id_param;
END;
$$;