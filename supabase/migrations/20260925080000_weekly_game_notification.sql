-- Weekly promo push for the 3 mini-games (Test Your Toast, Shoot Your Shot,
-- Red Flag or Green Flag - see src/pages/Games.tsx). One random message out
-- of 3 templates, once a week, per user. Tapping opens the Games hub
-- (action: open_games -> resolved client-side in
-- src/services/pushNotifications.ts / src/components/MainApp.tsx /
-- android MainActivity.java - see those for how a full route change, not a
-- tab switch, actually happens).
--
-- Scheduled Sundays at 15:30 UTC - a day and time nothing else uses, so it
-- can never land in the same slot as the hourly re-engagement job, the two
-- daily recommendation slots (12:30/19:30), the streak reminder (18:00) or
-- streak broken (00:10) pushes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_game_notification_sent_week date;

CREATE OR REPLACE FUNCTION public.send_game_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  rec record;
  v_title text;
  v_body text;
  v_pick integer;
  -- Monday of the current week (UTC) - a stable per-week key so this can
  -- never fire twice for the same user in the same week regardless of which
  -- day the job happens to run or be retried on.
  v_week_start date := date_trunc('week', (now() AT TIME ZONE 'utc'))::date;
BEGIN
  FOR rec IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
      AND p.last_game_notification_sent_week IS DISTINCT FROM v_week_start
    LIMIT 20000
  LOOP
    BEGIN
      v_pick := floor(random() * 3)::int;

      CASE v_pick
        WHEN 0 THEN
          v_title := 'Level up 🎮';
          v_body := 'Test your toast game and see how smooth your lines really are.';
        WHEN 1 THEN
          v_title := 'One shot 🎯';
          v_body := 'You get one message and one chance - take Shoot Your Shot.';
        ELSE
          v_title := 'Red flag or green flag? 🚩';
          v_body := 'Put your dating instincts to the test and see how you score.';
      END CASE;

      PERFORM net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'userId', rec.id,
          'type', 'system',
          'data', jsonb_build_object('action', 'open_games')
        )
      );

      UPDATE public.profiles
      SET last_game_notification_sent_week = v_week_start
      WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_game_notifications: skipping user % after error: %', rec.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;

SELECT cron.schedule(
  'send-game-notifications-weekly',
  '30 15 * * 0',
  $$SELECT public.send_game_notifications();$$
);
