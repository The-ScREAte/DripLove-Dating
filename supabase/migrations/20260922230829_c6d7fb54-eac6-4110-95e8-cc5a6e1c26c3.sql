CREATE OR REPLACE FUNCTION public.send_recommendation_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  rec record;
  v_countries text[];
  v_is_premium boolean;
  v_candidate uuid;
BEGIN
  FOR rec IN
    SELECT p.id, p.gender, p.preference, p.country_code, p.latitude, p.longitude,
           p.max_distance, p.min_age, p.max_age, p.unlocked_countries
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.country_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
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
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8'
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

    v_candidate := NULL;
  END LOOP;
END;
$function$;

SELECT cron.unschedule('send-recommendation-notifications')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-recommendation-notifications');

SELECT cron.schedule(
  'send-recommendation-notifications',
  '0 16 * * *',
  $$ SELECT public.send_recommendation_notifications(); $$
);