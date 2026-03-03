-- Increment per-user unread counters on every new chat message
-- This fixes unread badge counts when messages arrive while the recipient hasn't opened the thread.

CREATE OR REPLACE FUNCTION public.increment_match_unread_on_chat_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only increment for real messages
  IF NEW.match_id IS NULL OR NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.matches m
  SET
    user1_unread_count = CASE
      WHEN m.user1_id <> NEW.sender_id THEN COALESCE(m.user1_unread_count, 0) + 1
      ELSE COALESCE(m.user1_unread_count, 0)
    END,
    user2_unread_count = CASE
      WHEN m.user2_id <> NEW.sender_id THEN COALESCE(m.user2_unread_count, 0) + 1
      ELSE COALESCE(m.user2_unread_count, 0)
    END
  WHERE m.id = NEW.match_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_unread_on_chat_insert ON public.chats;
CREATE TRIGGER increment_unread_on_chat_insert
AFTER INSERT ON public.chats
FOR EACH ROW
EXECUTE FUNCTION public.increment_match_unread_on_chat_insert();
;
