-- Adds a 4th weekly game-notification template ("Practice makes perfect"),
-- gendered to the recipient: "the girl of your dreams" for male users, "the
-- man of your dreams" for female users. 'other' (the third gender value this
-- app actually uses) gets a neutral fallback rather than a guess.
-- Selection logic, schedule and everything else are unchanged from
-- 20260925080000_weekly_game_notification.sql.

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
  v_week_start date := date_trunc('week', (now() AT TIME ZONE 'utc'))::date;
BEGIN
  FOR rec IN
    SELECT p.id, p.gender
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
      AND p.last_game_notification_sent_week IS DISTINCT FROM v_week_start
    LIMIT 20000
  LOOP
    BEGIN
      v_pick := floor(random() * 4)::int;

      CASE v_pick
        WHEN 0 THEN
          v_title := 'Level up 🎮';
          v_body := 'Test your toast game and see how smooth your lines really are.';
        WHEN 1 THEN
          v_title := 'One shot 🎯';
          v_body := 'You get one message and one chance - take Shoot Your Shot.';
        WHEN 2 THEN
          v_title := 'Red flag or green flag? 🚩';
          v_body := 'Put your dating instincts to the test and see how you score.';
        ELSE
          v_title := 'Practice makes perfect 💬';
          v_body := 'Improve your toast to get the ' ||
            CASE rec.gender
              WHEN 'male' THEN 'girl'
              WHEN 'female' THEN 'man'
              ELSE 'person'
            END || ' of your dreams.';
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
