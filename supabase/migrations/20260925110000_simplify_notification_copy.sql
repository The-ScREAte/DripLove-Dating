-- Copy-only pass: shorter, fragment-style bodies instead of full sentences,
-- across welcome, streak reminder/broken, and the 4 weekly game templates.
-- No logic changes anywhere in this file - same eligibility, schedule,
-- dedup, and error isolation as before in every function touched.

CREATE OR REPLACE FUNCTION public.process_pending_welcome_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
begin
  for rec in
    select id, user_id
    from public.pending_welcome_notifications
    where sent = false and send_at <= now()
    order by send_at
    limit 50
  loop
    perform net.http_post(
      url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
      ),
      body := jsonb_build_object(
        'title', 'Welcome to DripLove',
        'body', 'Complete your profile — reach the right people',
        'userId', rec.user_id,
        'type', 'system',
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    update public.pending_welcome_notifications
      set sent = true
      where id = rec.id;
  end loop;
end;
$function$;

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
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    UPDATE public.profiles SET last_streak_reminder_sent_date = v_today WHERE id = rec.user_id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_streak_broken_notifications()
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
    SELECT p.id AS user_id, p.current_streak AS lost_streak
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.current_streak > 0
      AND p.last_streak_date <= v_today - 2
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
        'title', 'Killed your streak',
        'body', 'Keep your streak on to stay prioritised',
        'userId', rec.user_id,
        'type', 'system',
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    UPDATE public.profiles SET current_streak = 0 WHERE id = rec.user_id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_game_notifications(p_remaining_days integer DEFAULT 1)
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
  IF p_remaining_days < 1 THEN
    p_remaining_days := 1;
  END IF;

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
      IF random() >= 1.0 / p_remaining_days THEN
        CONTINUE;
      END IF;

      v_pick := floor(random() * 4)::int;

      CASE v_pick
        WHEN 0 THEN
          v_title := 'Level up 🎮';
          v_body := 'Test your toast — how smooth are your lines?';
        WHEN 1 THEN
          v_title := 'One shot 🎯';
          v_body := 'One message, one shot. Make it count.';
        WHEN 2 THEN
          v_title := 'Red flag or green flag? 🚩';
          v_body := 'Test your dating instincts.';
        ELSE
          v_title := 'Practice makes perfect 💬';
          v_body := 'Improve your toast — get the ' ||
            CASE rec.gender
              WHEN 'male' THEN 'girl'
              WHEN 'female' THEN 'man'
              ELSE 'person'
            END || ' of your dreams';
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
