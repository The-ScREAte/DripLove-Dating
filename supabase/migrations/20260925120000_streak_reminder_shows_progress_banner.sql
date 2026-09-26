-- Tapping the streak-reminder push now shows the same StreakFlash progress
-- banner the app already shows automatically once a day, instead of
-- silently landing on Discover with nothing to show for the tap. Adds
-- data.showStreakBanner: true - resolved client-side in
-- src/services/pushNotifications.ts (resolveNotificationRoute) and
-- src/components/MainApp.tsx (the notification nav handler + the banner's
-- own render condition). Deliberately NOT added to the streak-broken push -
-- current_streak is reset to 0 by then, nothing to celebrate. Everything
-- else (eligibility, schedule, copy) is unchanged.

CREATE OR REPLACE FUNCTION public.send_streak_reminder_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
    ORDER BY random()
    LIMIT 5000
  LOOP
    PERFORM net.http_post(
      url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
      ),
      body := jsonb_build_object(
        'title', 'Keep your ' || rec.current_streak || '-day streak going',
        'body', 'Hop on now — stay prioritised for matches',
        'userId', rec.user_id,
        'type', 'system',
        'data', jsonb_build_object('action', 'open_discover', 'showStreakBanner', true)
      )
    );

    UPDATE public.profiles SET last_streak_reminder_sent_date = v_today WHERE id = rec.user_id;
  END LOOP;
END;
$function$;
