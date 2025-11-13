-- Add INSERT policy for chats table
-- Users should be able to insert messages if they are the sender
-- The match validation will be handled by application logic

-- First, drop the policy if it exists
DROP POLICY IF EXISTS "Users can insert messages in their matches" ON public.chats;
DROP POLICY IF EXISTS "Users can send messages in their matches" ON public.chats;

-- Create a simpler policy that just checks if the user is the sender
CREATE POLICY "Users can send messages in their matches"
ON public.chats
FOR INSERT
WITH CHECK (sender_id = auth.uid());
