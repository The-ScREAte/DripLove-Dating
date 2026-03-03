-- Add RLS policies to allow message deletion

-- Allow users to update messages in their matches (for "delete for me" functionality)
CREATE POLICY "Users can update messages in their matches"
ON public.chats
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = chats.match_id
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = chats.match_id
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);

-- Allow users to delete their own messages (for "delete for everyone" functionality)
CREATE POLICY "Users can delete their own messages"
ON public.chats
FOR DELETE
USING (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = chats.match_id
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);;
