-- Notifies anyone whose streak just broke (missed their login entirely, past
-- the reminder window) and resets it. Complements send_streak_reminder_notifications
-- (fires the day before, while the streak is still alive but at risk) with the
-- "you lost it" follow-up so a killed streak doesn't just silently vanish -
-- the user gets told, and nudged to start a fresh one.
--
-- A user's streak has broken once two full UTC days have passed since their
-- last recorded login (yesterday was their last real chance - the reminder
-- already fired for that day - and it's now come and gone). current_streak
-- is reset to 0 right here rather than waiting for their next login, so the
-- app never keeps showing a streak number that's already dead; resetting it
-- also naturally prevents this job from notifying the same broken streak
-- again tomorrow, since the WHERE clause requires current_streak > 0.
CREATE OR REPLACE FUNCTION public.send_streak_broken_notifications()
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
    SELECT p.id AS user_id, p.current_streak AS lost_streak
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.current_streak > 0
      AND p.last_streak_date <= v_today - 2
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
        'title', 'Your ' || rec.lost_streak || '-day streak just ended 💔',
        'body', 'Log in today to start a new streak and get back in line for quality matches.',
        'userId', rec.user_id,
        'type', 'system',
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    UPDATE public.profiles SET current_streak = 0 WHERE id = rec.user_id;
  END LOOP;
END;
$function$;

-- 00:10 UTC daily - right after the day rolls over, so a streak that was
-- still alive as of the 18:00 UTC reminder the previous day but never acted
-- on is now definitively broken, not just "still today."
SELECT cron.schedule(
  'send-streak-broken-notifications',
  '10 0 * * *',
  $$ SELECT public.send_streak_broken_notifications(); $$
);
