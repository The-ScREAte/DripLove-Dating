-- Copy changes to two notification jobs. All eligibility/rotation/dedup/auth
-- logic is unchanged from
-- 20260924120200_fix_daily_notification_rotation_and_dedup.sql.
--
--   streak broken  -> "Killed your streak" / "Come back and get yourself prioritized."
--   recommendation -> personalised per recipient + candidate, e.g.
--                     "Ashley, you might like…" / "Nana • 27 • Accra • Gym"
--                     instead of the old generic "New recommendation for you".
--
-- The recommendation body prefers an interest the two actually SHARE (that's
-- the reason they're being recommended at all) and falls back to the
-- candidate's own first interest. Every segment is optional - a missing age,
-- city or interest is simply left out rather than rendering an empty slot.

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
        'body', 'Come back and get yourself prioritized.',
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
  v_cand record;
  v_age integer;
  v_interest text;
  v_title text;
  v_body text;
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  FOR rec IN
    SELECT p.id, p.first_name, p.interests, p.gender, p.preference, p.country_code,
           p.latitude, p.longitude, p.max_distance, p.min_age, p.max_age,
           p.unlocked_countries
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
      SELECT c.first_name, c.date_of_birth, c.city, c.interests
      INTO v_cand
      FROM public.profiles c
      WHERE c.id = v_candidate;

      v_age := CASE
        WHEN v_cand.date_of_birth IS NOT NULL
          THEN extract(year from age(v_cand.date_of_birth))::int
        ELSE NULL
      END;

      -- An interest they actually share reads as a real reason for the
      -- recommendation; the candidate's own first interest is the fallback.
      v_interest := NULL;
      SELECT x INTO v_interest
      FROM unnest(coalesce(v_cand.interests, '{}'::text[])) x
      WHERE x = ANY(coalesce(rec.interests, '{}'::text[]))
      LIMIT 1;

      IF v_interest IS NULL THEN
        v_interest := (coalesce(v_cand.interests, '{}'::text[]))[1];
      END IF;

      v_title := coalesce(nullif(rec.first_name, ''), 'Someone') || ', you might like…';

      v_body := coalesce(nullif(v_cand.first_name, ''), 'Someone new');
      IF v_age IS NOT NULL THEN
        v_body := v_body || ' • ' || v_age::text;
      END IF;
      IF v_cand.city IS NOT NULL AND v_cand.city <> '' THEN
        v_body := v_body || ' • ' || v_cand.city;
      END IF;
      IF v_interest IS NOT NULL AND v_interest <> '' THEN
        v_body := v_body || ' • ' || v_interest;
      END IF;

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
