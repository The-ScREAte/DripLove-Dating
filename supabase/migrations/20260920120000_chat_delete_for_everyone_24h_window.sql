-- "Delete for everyone" (now labeled "Delete for all" in the app) should
-- only ever be possible within 24 hours of sending, same as every
-- mainstream messaging app - past that window a message is only ever
-- removable for yourself ("Delete for me"). The client already hides the
-- option once a message is older than 24h, but that's just UI - without
-- this, anyone could still call the delete directly (devtools, a replayed
-- request, a modified client) and remove a message for both people well
-- after the window the product promises. Enforcing it here is the only
-- version of this rule that actually holds.
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.chats;

CREATE POLICY "Users can delete their own messages within 24h"
ON public.chats
FOR DELETE
USING (
  auth.uid() = sender_id
  AND created_at > now() - interval '24 hours'
  AND EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = chats.match_id
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);
