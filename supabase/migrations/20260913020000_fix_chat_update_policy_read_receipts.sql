-- The live "Users can update messages in their matches" UPDATE policy on
-- public.chats had drifted to `sender_id = auth.uid()` (sender-only), which
-- silently broke two things: read receipts (the RECIPIENT marking the
-- SENDER's message as is_read=true) and "delete for me" on a message the
-- current user received rather than sent. RLS denies these updates with zero
-- error and zero rows affected, so the app's own success/error handling never
-- caught it - messages just stayed on a single checkmark forever.
--
-- Restores the original, broader intent already present in
-- 20251028162722_.sql / 20251028162724_7728d221-f6aa-4f02-8511-eae21facae75.sql:
-- either participant in the match may update a message row, not just its
-- sender. Verified directly against production (insert a real message,
-- simulate the recipient's exact read-receipt UPDATE under this policy,
-- confirm is_read flips to true and persists; same for delete-for-me).

DROP POLICY IF EXISTS "Users can update messages in their matches" ON public.chats;

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
