-- When a match expires (10 days, no messages), the matches row was deleted
-- but the two underlying `likes` rows were left untouched. Since Discover's
-- exclusion logic treats any like as a PERMANENT exclusion (no time window,
-- unlike passes), this meant two people whose match expired could never see
-- each other in Discover again - not matched, not able to re-swipe, a dead
-- end forever. Fix: when a match is dissolved, destroy both likes and place
-- the pair on a 14-day cooldown (its own table/window, independent from the
-- regular 30-day pass window) instead of a bare matches delete. After the
-- cooldown, both people are free to swipe on each other again.

CREATE TABLE IF NOT EXISTS public.match_cooldowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_cooldowns_users_check CHECK (user1_id <> user2_id),
  -- user1_id/user2_id are always stored canonically (LEAST, GREATEST) so a
  -- pair only ever has one row regardless of which side triggered dissolution.
  CONSTRAINT match_cooldowns_unique UNIQUE (user1_id, user2_id)
);

ALTER TABLE public.match_cooldowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own cooldowns" ON public.match_cooldowns;
CREATE POLICY "Users can view their own cooldowns" ON public.match_cooldowns
  FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE INDEX IF NOT EXISTS idx_match_cooldowns_user1 ON public.match_cooldowns(user1_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_match_cooldowns_user2 ON public.match_cooldowns(user2_id, expires_at);

-- Only SELECT is granted - rows are written exclusively by the SECURITY
-- DEFINER function below, never directly by a client.
GRANT SELECT ON public.match_cooldowns TO authenticated;

-- Dissolves the given matches (only ones the caller is actually part of -
-- silently skips the rest, so a client can't dissolve someone else's match),
-- destroying both mutual likes and starting a 14-day cooldown for each pair.
CREATE OR REPLACE FUNCTION public.dissolve_matches(match_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_count integer := 0;
  m RECORD;
BEGIN
  FOR m IN
    SELECT id, user1_id, user2_id
    FROM matches
    WHERE id = ANY(match_ids)
      AND (user1_id = auth.uid() OR user2_id = auth.uid())
  LOOP
    DELETE FROM likes WHERE liker_id = m.user1_id AND liked_id = m.user2_id;
    DELETE FROM likes WHERE liker_id = m.user2_id AND liked_id = m.user1_id;

    INSERT INTO match_cooldowns (user1_id, user2_id, expires_at, created_at)
    VALUES (
      LEAST(m.user1_id, m.user2_id),
      GREATEST(m.user1_id, m.user2_id),
      now() + interval '14 days',
      now()
    )
    ON CONFLICT (user1_id, user2_id)
    DO UPDATE SET expires_at = excluded.expires_at, created_at = now();

    DELETE FROM matches WHERE id = m.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dissolve_matches(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dissolve_matches(uuid[]) TO authenticated;

-- Keep the legacy global cron-oriented function in sync with the same
-- likes/cooldown cleanup, in case it's ever wired up to pg_cron later.
CREATE OR REPLACE FUNCTION public.check_and_dissolve_expired_matches()
RETURNS TABLE(dissolved_count integer, notified_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_dissolved_count integer := 0;
  v_notified_count integer := 0;
  expired_match RECORD;
BEGIN
  FOR expired_match IN
    SELECT m.id, m.user1_id, m.user2_id, m.created_at
    FROM matches m
    LEFT JOIN chats c ON c.match_id = m.id
    WHERE m.created_at < now() - interval '10 days'
    AND c.id IS NULL
  LOOP
    DELETE FROM likes WHERE liker_id = expired_match.user1_id AND liked_id = expired_match.user2_id;
    DELETE FROM likes WHERE liker_id = expired_match.user2_id AND liked_id = expired_match.user1_id;

    INSERT INTO match_cooldowns (user1_id, user2_id, expires_at, created_at)
    VALUES (
      LEAST(expired_match.user1_id, expired_match.user2_id),
      GREATEST(expired_match.user1_id, expired_match.user2_id),
      now() + interval '14 days',
      now()
    )
    ON CONFLICT (user1_id, user2_id)
    DO UPDATE SET expires_at = excluded.expires_at, created_at = now();

    DELETE FROM matches WHERE id = expired_match.id;
    v_dissolved_count := v_dissolved_count + 1;
  END LOOP;

  FOR expired_match IN
    SELECT DISTINCT m.id, m.user1_id, m.user2_id, m.created_at,
           u1.first_name as user1_name,
           u2.first_name as user2_name
    FROM matches m
    LEFT JOIN chats c ON c.match_id = m.id
    JOIN profiles u1 ON u1.id = m.user1_id
    JOIN profiles u2 ON u2.id = m.user2_id
    WHERE m.created_at < now() - interval '9 days'
    AND m.created_at >= now() - interval '10 days'
    AND c.id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id IN (m.user1_id, m.user2_id)
      AND n.type = 'match_expiring'
      AND n.created_at > now() - interval '1 day'
      AND n.related_user_id IN (m.user1_id, m.user2_id)
    )
  LOOP
    INSERT INTO notifications (user_id, title, message, type, related_user_id, is_read)
    VALUES
      (
        expired_match.user1_id,
        'Match Expiring Soon!',
        'Your match with ' || expired_match.user2_name || ' expires in 1 day. Start chatting now!',
        'match_expiring',
        expired_match.user2_id,
        false
      ),
      (
        expired_match.user2_id,
        'Match Expiring Soon!',
        'Your match with ' || expired_match.user1_name || ' expires in 1 day. Start chatting now!',
        'match_expiring',
        expired_match.user1_id,
        false
      );

    v_notified_count := v_notified_count + 2;
  END LOOP;

  RETURN QUERY SELECT v_dissolved_count, v_notified_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_and_dissolve_expired_matches() FROM PUBLIC, anon, authenticated;
