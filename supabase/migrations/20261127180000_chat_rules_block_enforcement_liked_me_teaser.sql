-- Applied 2026-11-27 after a rolled-back test of every rule (length, reply_to, recipient, rate limit, deleted_for, blocks).
-- 1) Chat rules enforced in the DB for client roles (anon/authenticated, non-admin):
--      - message must be 1..2000 chars after trim
--      - no sending when a block exists in EITHER direction between the two match members
--        (the old client check could never see "they blocked me": RLS on blocks only exposes rows you created)
--      - reply_to must point at a message of the SAME match
--      - recipient_id is forced to the other match member (it used to be client-settable)
--      - rate limit: max 30 messages per minute per sender
-- 2) CHECK constraint on chats.message (NOT VALID: existing rows are not re-checked; verified 0 violating rows on 2026-11-27).
-- 3) create_message_notification: no in-app notification when a block exists (defence in depth).
-- 4) protect_chat_message_immutable: a user may only add/remove THEIR OWN id in deleted_for
--    (before, either party could write the other's id and hide messages from them).
-- 5) get_likers_teaser(): limited-field liker list for FREE users (see note at the bottom; client not wired).

-- ---------------------------------------------------------------------------------------------
-- 1) BEFORE INSERT guard
CREATE OR REPLACE FUNCTION public.chats_enforce_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_u1 uuid;
  v_u2 uuid;
  v_partner uuid;
  v_len int;
BEGIN
  -- service role / SQL editor / internal triggers are not restricted
  IF auth.role() IS NULL OR auth.role() NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN RETURN NEW; END IF;

  v_len := char_length(btrim(coalesce(NEW.message, '')));
  IF v_len < 1 THEN
    RAISE EXCEPTION 'Message cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF v_len > 2000 OR char_length(NEW.message) > 4000 THEN
    RAISE EXCEPTION 'Message too long (max 2000 characters)' USING ERRCODE = '22023';
  END IF;

  SELECT m.user1_id, m.user2_id INTO v_u1, v_u2 FROM public.matches m WHERE m.id = NEW.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found' USING ERRCODE = '42501';
  END IF;
  v_partner := CASE WHEN v_u1 = NEW.sender_id THEN v_u2 ELSE v_u1 END;
  NEW.recipient_id := v_partner;

  IF EXISTS (SELECT 1 FROM public.blocks b
             WHERE (b.blocker_id = NEW.sender_id AND b.blocked_id = v_partner)
                OR (b.blocker_id = v_partner AND b.blocked_id = NEW.sender_id)) THEN
    RAISE EXCEPTION 'Cannot send messages to this user' USING ERRCODE = '42501';
  END IF;

  IF NEW.reply_to IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.chats c WHERE c.id = NEW.reply_to AND c.match_id = NEW.match_id) THEN
    RAISE EXCEPTION 'Invalid reply target' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.chats c
      WHERE c.sender_id = NEW.sender_id AND c.created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'You are sending messages too quickly' USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.chats_enforce_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chats_enforce_rules ON public.chats;
-- name sorts before trg_set_chat_recipient_id, so it runs first
CREATE TRIGGER trg_chats_enforce_rules BEFORE INSERT ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.chats_enforce_rules();

-- ---------------------------------------------------------------------------------------------
-- 2) Table-level backstop (applies to every writer, incl. service role). NOT VALID = existing rows untouched.
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_message_length_chk;
ALTER TABLE public.chats ADD CONSTRAINT chats_message_length_chk
  CHECK (message IS NOT NULL AND char_length(btrim(message)) BETWEEN 1 AND 2000) NOT VALID;

-- ---------------------------------------------------------------------------------------------
-- 3) notification: skip when blocked
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  receiver_id UUID;
  sender_name TEXT;
BEGIN
  SELECT CASE WHEN m.user1_id = NEW.sender_id THEN m.user2_id ELSE m.user1_id END INTO receiver_id
  FROM public.matches m WHERE m.id = NEW.match_id;

  IF receiver_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.blocks b
             WHERE (b.blocker_id = NEW.sender_id AND b.blocked_id = receiver_id)
                OR (b.blocker_id = receiver_id AND b.blocked_id = NEW.sender_id)) THEN
    RETURN NEW;
  END IF;

  SELECT CONCAT(first_name, ' ', last_name) INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
  VALUES (receiver_id, 'message', 'New Message', sender_name || ' sent you a message', NEW.sender_id);

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 4) deleted_for: only your own id may change
CREATE OR REPLACE FUNCTION public.protect_chat_message_immutable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  me text := auth.uid()::text;
BEGIN
  IF auth.role() IS NULL OR auth.role() NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN RETURN NEW; END IF;
  NEW.message := OLD.message; NEW.sender_id := OLD.sender_id; NEW.match_id := OLD.match_id;
  NEW.created_at := OLD.created_at; NEW.reply_to := OLD.reply_to; NEW.recipient_id := OLD.recipient_id;
  -- keep everyone else's entries exactly as they were; the caller only decides about their own id
  NEW.deleted_for := COALESCE((SELECT array_agg(x) FROM unnest(COALESCE(OLD.deleted_for, '{}'::text[])) x WHERE x IS DISTINCT FROM me), '{}'::text[])
    || CASE WHEN me IS NOT NULL AND me = ANY(COALESCE(NEW.deleted_for, '{}'::text[])) THEN ARRAY[me] ELSE '{}'::text[] END;
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------------------------
-- 5) Liked Me teaser for free users. Premium callers get the real ids (same as get_likers_page); free callers get
--    liker_id = NULL plus only a coarse age bucket and the like time. NOTE: this only helps once (a) the client
--    uses it for free users instead of select('*') on profiles/user_images, AND (b) the open profile-read policy
--    ("Authenticated users can view profiles", auth.uid() IS NOT NULL) and the likes SELECT policy
--    (liked_id = auth.uid()) are narrowed - otherwise a modified client can still read liker ids from `likes` and
--    their profiles directly. Those are bigger changes and are deliberately NOT done here.
CREATE OR REPLACE FUNCTION public.get_likers_teaser(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(liker_id uuid, liked_at timestamptz, age_bucket text, is_premium boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT public._is_premium_now(auth.uid()) AS prem)
  SELECT CASE WHEN me.prem THEN l.liker_id ELSE NULL END,
         l.created_at,
         CASE WHEN p.date_of_birth IS NULL THEN NULL
              ELSE (floor(extract(year FROM age(p.date_of_birth)) / 5) * 5)::int::text || 's' END,
         me.prem
  FROM me, public.likes l
  LEFT JOIN public.profiles p ON p.id = l.liker_id
  WHERE auth.uid() IS NOT NULL
    AND l.liked_id = auth.uid()
    AND l.liker_id <> auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = auth.uid() AND b.blocked_id = l.liker_id) OR (b.blocker_id = l.liker_id AND b.blocked_id = auth.uid()))
    AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE (m.user1_id = auth.uid() AND m.user2_id = l.liker_id) OR (m.user2_id = auth.uid() AND m.user1_id = l.liker_id))
  ORDER BY l.created_at DESC
  LIMIT least(greatest(p_limit, 1), 100) OFFSET greatest(p_offset, 0);
$$;
REVOKE EXECUTE ON FUNCTION public.get_likers_teaser(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_likers_teaser(integer, integer) TO authenticated;
