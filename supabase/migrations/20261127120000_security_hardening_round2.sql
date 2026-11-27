-- Security hardening round 2 (final assessment, 2026-11-27)
-- Verified exploitable before this migration (tested as an ordinary signed-in user in a rolled-back txn):
--   * any user could UPDATE profiles.is_admin = true on themselves (admin takeover)
--   * any user could INSERT notifications for other users; force-insert matches without a mutual like
--   * like/pass/usage/streak/subscription/circle-up RPCs trusted a caller-supplied user id
--   * get_likers_page leaked another user's likers; delete_match_with_chats deleted any match
--   * get_random_discover_profiles (full profile rows) was callable with only the public anon key
--   * email_broadcast_history readable/writable by everyone
--   * any signed-in user could overwrite/delete other users' photos in storage
--   * chat messages could be posted into matches you are not part of, and edited after sending

-- 1. Privileged profile columns: only admins / server roles may change them -------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;  -- service role / cron / auth admin / postgres
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.is_verified := false;
    NEW.account_status := 'active';
    NEW.visibility_boost_until := NULL;
    NEW.visibility_boost_multiplier := 1;
    RETURN NEW;
  END IF;
  NEW.is_admin := OLD.is_admin;
  NEW.is_verified := OLD.is_verified;
  NEW.account_status := OLD.account_status;
  NEW.visibility_boost_until := OLD.visibility_boost_until;
  NEW.visibility_boost_multiplier := OLD.visibility_boost_multiplier;
  NEW.feed_random_weight := OLD.feed_random_weight;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS aa_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER aa_protect_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- 2. Ownership guards on RPCs that take a user id --------------------------------------------
-- Injects: IF caller is a client (anon/authenticated) and uid <> param THEN raise.
-- Server callers (service_role / cron / postgres) are unaffected.
DO $$
DECLARE r record; def text; guard text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('like_and_usage_batched','liker_id_param'),
      ('pass_and_usage_batched','passer_id_param'),
      ('update_user_usage','user_id_param'),
      ('record_daily_login','p_user_id'),
      ('get_current_subscription_status','p_user_id'),
      ('get_user_subscription','user_id_param'),
      ('circle_up_check_session','p_user_id'),
      ('circle_up_find_match','p_user_id'),
      ('circle_up_list_candidates','p_user_id'),
      ('circle_up_request_session','p_user_id')
    ) AS t(fn, prm)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.fn LIMIT 1;
    IF def IS NULL OR def LIKE '%ownership_guard%' THEN CONTINUE; END IF;
    guard := format($g$BEGIN /*ownership_guard*/ IF auth.role() IN ('anon','authenticated') AND auth.uid() IS DISTINCT FROM %I THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF; $g$, r.prm);
    EXECUTE regexp_replace(def, '\mBEGIN\M', replace(guard, '\', '\\'), 'i');
  END LOOP;
END $$;

-- get_likers_page (SQL function) – re-created with the same guard
CREATE OR REPLACE FUNCTION public.get_likers_page(p_user_id uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(liker_id uuid, liked_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT l.liker_id, l.created_at AS liked_at
  FROM public.likes l
  WHERE l.liked_id = p_user_id
    AND (coalesce(auth.role(), '') NOT IN ('anon','authenticated') OR auth.uid() = p_user_id)
    AND l.liker_id <> p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = p_user_id AND b.blocked_id = l.liker_id) OR (b.blocker_id = l.liker_id AND b.blocked_id = p_user_id))
    AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE (m.user1_id = p_user_id AND m.user2_id = l.liker_id) OR (m.user2_id = p_user_id AND m.user1_id = l.liker_id))
  ORDER BY l.created_at DESC
  LIMIT least(greatest(p_limit, 1), 100) OFFSET greatest(p_offset, 0);
$$;

-- delete_match_with_chats: caller must be a participant (or server/admin)
CREATE OR REPLACE FUNCTION public.delete_match_with_chats(match_id_param uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() IN ('anon','authenticated')
     AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id_param AND auth.uid() IN (m.user1_id, m.user2_id))
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.chats WHERE match_id = match_id_param;
  DELETE FROM public.matches WHERE id = match_id_param;
END $$;

-- 3. Function execute privileges ------------------------------------------------------------
-- anon may only call the handful of pre-login / public-link functions.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.prosecdef
      AND p.proname NOT IN ('validate_promo_code','get_enabled_countries','increment_redirect_clicks',
        'increment_ad_click','increment_ad_impression','influencer_login','accept_influencer_terms',
        'set_influencer_password','validate_promo_code_setup_link','request_influencer_payout',
        'get_influencer_lead_demographics','get_email_auth_providers')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- Server-only (cron / edge functions): not callable by any client.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND (
      p.proname IN ('handle_payment_failure','send_game_notifications','send_recommendation_notifications',
        'send_reengagement_notifications','send_streak_broken_notifications','send_streak_reminder_notifications',
        'record_daily_active_count')
      OR p.prorettype = 'trigger'::regtype)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Trigger functions that insert as the invoker must keep working once notification inserts are locked.
ALTER FUNCTION public.create_message_notification() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.create_match_on_mutual_like() SECURITY DEFINER SET search_path = public;

-- 4. RLS fixes ------------------------------------------------------------------------------
-- notifications: only admins may insert from a client (triggers / edge functions bypass)
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Admins can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE));

-- matches: a user can only create a match when both users liked each other
DROP POLICY IF EXISTS "Users can create matches when they like back" ON public.matches;
DROP POLICY IF EXISTS "Users can insert their own matches" ON public.matches;
CREATE POLICY "Users can create matches only after mutual like" ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (user1_id, user2_id)
    AND EXISTS (SELECT 1 FROM public.likes a WHERE a.liker_id = matches.user1_id AND a.liked_id = matches.user2_id)
    AND EXISTS (SELECT 1 FROM public.likes b WHERE b.liker_id = matches.user2_id AND b.liked_id = matches.user1_id));

-- chats: must be a participant of the match to post; messages are immutable apart from read/deleted flags
DROP POLICY IF EXISTS "Users can send messages in their matches" ON public.chats;
CREATE POLICY "Users can send messages in their matches" ON public.chats
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.matches m WHERE m.id = chats.match_id AND auth.uid() IN (m.user1_id, m.user2_id)));

CREATE OR REPLACE FUNCTION public.protect_chat_message_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN RETURN NEW; END IF;
  NEW.message := OLD.message; NEW.sender_id := OLD.sender_id; NEW.match_id := OLD.match_id;
  NEW.created_at := OLD.created_at; NEW.reply_to := OLD.reply_to; NEW.recipient_id := OLD.recipient_id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_chat_message_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS aa_protect_chat_message_immutable ON public.chats;
CREATE TRIGGER aa_protect_chat_message_immutable BEFORE UPDATE ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.protect_chat_message_immutable();

-- broadcast history: server only
DROP POLICY IF EXISTS "Service role full access on email_broadcast_history" ON public.email_broadcast_history;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='email_broadcast_history'
           AND roles::text LIKE '%public%' AND qual = 'true' LOOP
    EXECUTE format('DROP POLICY %I ON public.email_broadcast_history', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "Service role full access on email_broadcast_history" ON public.email_broadcast_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role can insert history" ON public.scheduled_broadcast_history;

-- 5. Storage: users may only touch files in their own folder; restrict type/size -------------
DROP POLICY IF EXISTS "Authenticated users can manage their images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos." ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile photos." ON storage.objects;
UPDATE storage.buckets SET file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif','image/gif']
WHERE id = 'user-photos';
