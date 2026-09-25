-- Two hardening fixes for the daily notification cron jobs:
--
-- 1. send_streak_reminder_notifications(), send_streak_broken_notifications()
--    and send_recommendation_notifications() each cap their eligible-user
--    scan with LIMIT (5000 / 5000 / 20000) but had no ORDER BY. Without one,
--    Postgres returns rows in a stable-ish physical/index order, so if the
--    eligible pool ever exceeds the cap, the same overflow users could be
--    silently skipped run after run instead of being rotated through. Adding
--    ORDER BY random() means an overflow is a rotating sample, not a
--    permanent blind spot for a fixed set of users.
--
-- 2. send_recommendation_notifications() had no per-day dedup column, unlike
--    the two streak jobs (which use last_streak_reminder_sent_date). It's
--    harmless today since it's called from a single daily cron entry, but
--    nothing in the SQL itself would stop a double-send if that cron entry
--    were ever accidentally duplicated. Adding last_recommendation_sent_date
--    mirrors the streak jobs' guard and, ordered nulls-first, doubles as a
--    fairer overflow rotation than random() (least-recently-notified first).
--
-- 3. All four functions here (plus process_pending_welcome_notifications)
--    now read their internal auth token from public.internal_secrets (key
--    'notification_cron_anon_key') instead of a hardcoded bearer token
--    inline, so this file doesn't commit a literal secret to source control.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_recommendation_sent_date date;

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

CREATE OR REPLACE FUNCTION public.send_recommendation_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  rec record;
  v_countries text[];
  v_is_premium boolean;
  v_candidate uuid;
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  FOR rec IN
    SELECT p.id, p.gender, p.preference, p.country_code, p.latitude, p.longitude,
           p.max_distance, p.min_age, p.max_age, p.unlocked_countries
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.country_code IS NOT NULL
      AND p.last_recommendation_sent_date IS DISTINCT FROM v_today
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
    ORDER BY p.last_recommendation_sent_date NULLS FIRST
    LIMIT 20000
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.user_subscriptions s
      WHERE s.user_id = rec.id
        AND s.plan_name = 'premium'
        AND s.status IN ('active', 'cancelled')
        AND (s.expires_at IS NULL OR s.expires_at > now())
    ) INTO v_is_premium;

    v_countries := ARRAY[rec.country_code];
    IF v_is_premium AND rec.unlocked_countries IS NOT NULL THEN
      v_countries := ARRAY(SELECT DISTINCT unnest(v_countries || rec.unlocked_countries));
    END IF;

    SELECT c.id INTO v_candidate
    FROM public.profiles c
    WHERE c.id <> rec.id
      AND c.account_status = 'active'
      AND c.is_admin IS NOT TRUE
      AND c.is_archived IS NOT TRUE
      AND c.country_code = ANY(v_countries)
      AND (c.preference = rec.gender OR c.preference = 'everyone')
      AND (rec.preference = 'everyone' OR rec.preference IS NULL OR c.gender = rec.preference)
      AND date_part('year', age(c.date_of_birth))
          BETWEEN COALESCE(rec.min_age, 18) AND COALESCE(rec.max_age, 99)
      AND (
        c.country_code <> rec.country_code
        OR rec.latitude IS NULL OR rec.longitude IS NULL
        OR c.latitude IS NULL OR c.longitude IS NULL
        OR public.calculate_distance(rec.latitude, rec.longitude, c.latitude, c.longitude)
           <= COALESCE(rec.max_distance, 5000)
      )
      AND NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = rec.id AND l.liked_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.passes ps WHERE ps.passer_id = rec.id AND ps.passed_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = rec.id AND b.blocked_id = c.id)
           OR (b.blocker_id = c.id AND b.blocked_id = rec.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.matches m
        WHERE (m.user1_id = rec.id AND m.user2_id = c.id)
           OR (m.user1_id = c.id AND m.user2_id = rec.id)
      )
    ORDER BY random()
    LIMIT 1;

    IF v_candidate IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', 'New recommendation for you',
          'body', 'Someone new in your Circle fits what you are looking for. Tap to view their profile.',
          'userId', rec.id,
          'type', 'system',
          'data', jsonb_build_object(
            'action', 'open_circle_profile',
            'profileId', v_candidate,
            'senderId', v_candidate
          )
        )
      );
    END IF;

    UPDATE public.profiles SET last_recommendation_sent_date = v_today WHERE id = rec.id;

    v_candidate := NULL;
  END LOOP;
END;
$function$;

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
