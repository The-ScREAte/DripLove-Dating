-- Scale fixes, batch 1: the two highest-ROI backend bottlenecks found in the
-- scale audit.
--
-- 1) Three missing indexes on the hottest query paths in the app:
--    - chats(match_id, created_at): every chat open/refresh/read-receipt
--      filters on match_id with no index - full table scan today.
--    - matches(user2_id): the "my matches" lookup does
--      .or(user1_id.eq.X,user2_id.eq.X) but only user1_id has a usable index
--      (the UNIQUE(user1_id, user2_id) constraint only serves lookups
--      leading with user1_id).
--    - profiles(gender, account_status): the Discover feed RPC filters on
--      both of these with no index backing either.
CREATE INDEX IF NOT EXISTS idx_chats_match_id_created_at ON public.chats (match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_matches_user2_id ON public.matches (user2_id);
CREATE INDEX IF NOT EXISTS idx_profiles_gender_account_status ON public.profiles (gender, account_status);

-- 2) chats.recipient_id - lets the two "new message" Realtime subscriptions
--    (MainApp.tsx's unread-badge channel, ChatPage.tsx's unread-chats
--    channel) filter server-side instead of subscribing to every INSERT on
--    the whole table and filtering client-side after receiving it. Without
--    this, every message any user sends is broadcast over the realtime
--    socket to every other currently-connected user, twice - the single
--    most severe "sudden cliff" scaling risk found in the audit (cost grows
--    with active-users x messages/sec, not with how many of those messages
--    are actually relevant to each recipient).
--
--    Populated by a trigger rather than trusted from the client, exactly
--    like sender_id already is via the existing RLS check - keeps this
--    correct regardless of which code path inserts a row.
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.set_chat_recipient_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.recipient_id IS NULL THEN
    SELECT CASE WHEN m.user1_id = NEW.sender_id THEN m.user2_id ELSE m.user1_id END
    INTO NEW.recipient_id
    FROM public.matches m
    WHERE m.id = NEW.match_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_chat_recipient_id ON public.chats;
CREATE TRIGGER trg_set_chat_recipient_id
BEFORE INSERT ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.set_chat_recipient_id();

-- Backfill existing rows so the new filtered subscriptions work for
-- messages sent before this migration too.
UPDATE public.chats c
SET recipient_id = CASE WHEN m.user1_id = c.sender_id THEN m.user2_id ELSE m.user1_id END
FROM public.matches m
WHERE m.id = c.match_id AND c.recipient_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chats_recipient_id_created_at ON public.chats (recipient_id, created_at);
