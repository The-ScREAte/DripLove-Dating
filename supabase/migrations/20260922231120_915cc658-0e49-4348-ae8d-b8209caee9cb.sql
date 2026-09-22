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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8'
      ),
      body := jsonb_build_object(
        'title', 'Welcome to DripLove',
        'body', 'You are all set. Complete your profile so the right people can find you.',
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
        'title', 'Keep your ' || rec.current_streak || '-day streak going',
        'body', 'Log in today to keep your streak and stay prioritised for quality matches.',
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
        'title', 'Your ' || rec.lost_streak || '-day streak has ended',
        'body', 'Log in today to start a new streak and stay in line for quality matches.',
        'userId', rec.user_id,
        'type', 'system',
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    UPDATE public.profiles SET current_streak = 0 WHERE id = rec.user_id;
  END LOOP;
END;
$function$;