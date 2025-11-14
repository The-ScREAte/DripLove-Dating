-- Add SELECT policy for chats table
-- Users should be able to read messages from their matches

CREATE POLICY "Users can read messages in their matches"
ON public.chats
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = chats.match_id
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);
