-- Daily login streak: log in at least once a day to keep it going. Higher
-- streak = higher priority in the Discover feed (see applyActivityWeighting
-- in src/utils/activityWeighting.ts, which is where the actual boost is
-- applied client-side - these columns are just the data source for it).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_date date,
  ADD COLUMN IF NOT EXISTS last_streak_reminder_sent_date date;

-- Called once per app session (see useDailyStreak.ts) right after the user
-- is confirmed authenticated. Idempotent per calendar day (UTC) - calling
-- it again the same day just returns the already-current streak with
-- is_new_day = false, so the client's "show the flash" decision can key
-- off is_new_day alone without its own separate day-tracking.
CREATE OR REPLACE FUNCTION public.record_daily_login(p_user_id uuid)
RETURNS TABLE (current_streak integer, longest_streak integer, is_new_day boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_last_date date;
  v_current integer;
  v_longest integer;
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_is_new boolean := false;
BEGIN
  SELECT p.last_streak_date, p.current_streak, p.longest_streak
  INTO v_last_date, v_current, v_longest
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_last_date IS NULL OR v_last_date < v_today - 1 THEN
    -- No streak yet, or it lapsed (missed a day or more) - restart at 1.
    v_current := 1;
    v_is_new := true;
  ELSIF v_last_date = v_today - 1 THEN
    -- Logged in yesterday, not yet today - extend the streak.
    v_current := v_current + 1;
    v_is_new := true;
  ELSIF v_last_date = v_today THEN
    -- Already recorded today - nothing to do, no flash.
    v_is_new := false;
  END IF;

  IF v_is_new THEN
    v_longest := GREATEST(v_longest, v_current);
    UPDATE public.profiles
    SET current_streak = v_current,
        longest_streak = v_longest,
        last_streak_date = v_today
    WHERE id = p_user_id;
  END IF;

  RETURN QUERY SELECT v_current, v_longest, v_is_new;
END;
$function$;

-- Reminds anyone whose streak is still alive (logged in yesterday) but
-- hasn't logged in yet today, before they lose it. Mirrors
-- send_reengagement_notifications() exactly - same net.http_post call to
-- send-push-notification, same per-day dedupe column pattern
-- (last_streak_reminder_sent_date, same idea as that function's
-- last_reengagement_sent_at) - the one already-proven pattern this project
-- uses for every other scheduled per-user push.
CREATE OR REPLACE FUNCTION public.send_streak_reminder_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  rec record;
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  FOR rec IN
    SELECT p.id AS user_id, p.current_streak
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.current_streak > 0
      AND p.last_streak_date = v_today - 1
      AND p.last_streak_reminder_sent_date IS DISTINCT FROM v_today
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
    LIMIT 5000
  LOOP
    PERFORM net.http_post(
      url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8'
      ),
      body := jsonb_build_object(
        'title', '🔥 Keep your ' || rec.current_streak || '-day streak alive!',
        'body', 'Go on to keep your streak going and get prioritized for quality matches.',
        'userId', rec.user_id,
        'type', 'system',
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    UPDATE public.profiles SET last_streak_reminder_sent_date = v_today WHERE id = rec.user_id;
  END LOOP;
END;
$function$;

-- Once daily, 6pm UTC - late enough that most people who were going to log
-- in today already have, early enough it's not the middle of the night
-- everywhere. Same net.http_post-via-pg_cron pattern already used for
-- cleanup-expired-matches/check-dormant-chats (see cron.job).
SELECT cron.schedule(
  'send-streak-reminder-notifications',
  '0 18 * * *',
  $$ SELECT public.send_streak_reminder_notifications(); $$
);
