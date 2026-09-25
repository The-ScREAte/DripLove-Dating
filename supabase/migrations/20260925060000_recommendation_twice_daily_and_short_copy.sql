-- Recommendation push: twice a day for premium, once for free, spaced apart,
-- never repeating the same person back-to-back, with short notification copy.
--
-- 1. FREQUENCY. Previously one send per user per day, gated by a single
--    last_recommendation_sent_date. Premium now gets two per day and free
--    stays at one. Two separate cron entries (12:30 and 19:30 UTC) call the
--    same function; the per-user cap below decides who actually gets each
--    run, so free users simply take the first slot they're eligible for and
--    are skipped by the second.
--
--    Times deliberately land on :30. Every other notification job runs on the
--    hour (re-engagement is hourly at :00, streak reminder 18:00, streak
--    broken 00:10), so :30 guarantees a recommendation never arrives in the
--    same minute as another push. The 7h gap between the two slots also
--    comfortably clears the 6h minimum spacing enforced per user.
--
-- 2. VARIETY. The candidate pick used LIMIT 1 with no ordering against the
--    Circle 'recommended' row, so it returned the same first element every
--    single time - a premium user getting two a day would have seen the same
--    person twice, every day. Now randomised, and the person sent last time
--    is excluded outright via last_recommended_profile_id.
--
-- 3. COPY. The body read like a sentence ("what you're both looking for - in
--    common, Find out more!"). Now it's just the facts, separated by bullets:
--    "Ikenna • 36 • delta • Travel". Traits are rendered as plain labels
--    rather than prose.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recommendation_sends_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_recommendation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_recommended_profile_id uuid;

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
  v_candidate_id uuid;
  v_candidate record;
  v_trait text;
  v_age integer;
  v_title text;
  v_body text;
  v_max_sends integer;
  v_sends_today integer;
  v_today date := (now() AT TIME ZONE 'utc')::date;
  -- Two slots are 7h apart; this only has to stop the same slot double-firing
  -- (a manual re-run, an accidentally duplicated cron entry) from stacking two
  -- pushes on top of each other.
  v_min_gap interval := interval '6 hours';
BEGIN
  FOR rec IN
    SELECT p.id, p.first_name, p.interests, p.languages, p.pets,
           p.relationship_intent, p.family_plans,
           p.gender, p.preference, p.country_code, p.latitude, p.longitude,
           p.max_distance, p.min_age, p.max_age, p.unlocked_countries,
           p.last_recommendation_sent_date, p.recommendation_sends_today,
           p.last_recommendation_sent_at, p.last_recommended_profile_id
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.country_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
      -- Cheap pre-filter only; the real per-user cap needs premium status,
      -- which is resolved inside the loop.
      AND (
        p.last_recommendation_sent_date IS DISTINCT FROM v_today
        OR COALESCE(p.recommendation_sends_today, 0) < 2
      )
      AND (
        p.last_recommendation_sent_at IS NULL
        OR p.last_recommendation_sent_at < now() - interval '6 hours'
      )
    ORDER BY p.last_recommendation_sent_at NULLS FIRST
    LIMIT 20000
  LOOP
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM public.user_subscriptions s
        WHERE s.user_id = rec.id
          AND s.plan_name = 'premium'
          AND s.status IN ('active', 'cancelled')
          AND (s.expires_at IS NULL OR s.expires_at > now())
      ) INTO v_is_premium;

      v_max_sends := CASE WHEN v_is_premium THEN 2 ELSE 1 END;
      v_sends_today := CASE
        WHEN rec.last_recommendation_sent_date = v_today
          THEN COALESCE(rec.recommendation_sends_today, 0)
        ELSE 0
      END;

      IF v_sends_today >= v_max_sends THEN
        CONTINUE;
      END IF;

      IF rec.last_recommendation_sent_at IS NOT NULL
         AND rec.last_recommendation_sent_at > now() - v_min_gap THEN
        CONTINUE;
      END IF;

      v_countries := ARRAY[rec.country_code];
      IF v_is_premium AND rec.unlocked_countries IS NOT NULL THEN
        v_countries := ARRAY(SELECT DISTINCT unnest(v_countries || rec.unlocked_countries));
      END IF;

      -- The row the Circle tab actually renders, randomised so a user who
      -- gets two a day doesn't see the same person twice, and never the
      -- person sent to them last time.
      v_candidate_id := NULL;
      SELECT pid INTO v_candidate_id
      FROM (
        SELECT unnest(profile_ids) AS pid
        FROM public.circle_row_batches
        WHERE user_id = rec.id AND row_key = 'recommended'
      ) candidates
      WHERE (rec.last_recommended_profile_id IS NULL OR candidates.pid <> rec.last_recommended_profile_id)
        AND NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = rec.id AND l.liked_id = candidates.pid)
        AND NOT EXISTS (SELECT 1 FROM public.passes ps WHERE ps.passer_id = rec.id AND ps.passed_id = candidates.pid)
        AND NOT EXISTS (
          SELECT 1 FROM public.matches m
          WHERE (m.user1_id = rec.id AND m.user2_id = candidates.pid)
             OR (m.user2_id = rec.id AND m.user1_id = candidates.pid)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.blocker_id = rec.id AND b.blocked_id = candidates.pid)
             OR (b.blocker_id = candidates.pid AND b.blocked_id = rec.id)
        )
      ORDER BY random()
      LIMIT 1;

      IF v_candidate_id IS NULL THEN
        SELECT c.id INTO v_candidate_id
        FROM public.profiles c
        WHERE c.id <> rec.id
          AND (rec.last_recommended_profile_id IS NULL OR c.id <> rec.last_recommended_profile_id)
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
          AND EXISTS (
            SELECT 1 FROM public.user_images ui
            WHERE ui.user_id = c.id AND ui.is_approved = true AND ui.image_order <> -1
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
        ORDER BY
          (coalesce(rec.interests, '{}'::text[]) && coalesce(c.interests, '{}'::text[])) DESC,
          random()
        LIMIT 1;
      END IF;

      IF v_candidate_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT first_name, date_of_birth, city, interests, languages, pets,
             relationship_intent
      INTO v_candidate
      FROM public.profiles
      WHERE id = v_candidate_id;

      -- One short label, never a sentence. A shared interest is the most
      -- meaningful and reads cleanest ("Travel"), then a shared language,
      -- then a shared pet, then what they're both here for.
      v_trait := NULL;

      SELECT x INTO v_trait
      FROM unnest(coalesce(v_candidate.interests, '{}'::text[])) x
      WHERE x = ANY(coalesce(rec.interests, '{}'::text[]))
      LIMIT 1;

      IF v_trait IS NULL THEN
        SELECT x INTO v_trait
        FROM unnest(coalesce(v_candidate.languages, '{}'::text[])) x
        WHERE x = ANY(coalesce(rec.languages, '{}'::text[]))
        LIMIT 1;
      END IF;

      IF v_trait IS NULL THEN
        SELECT x INTO v_trait
        FROM unnest(coalesce(v_candidate.pets, '{}'::text[])) x
        WHERE x = ANY(coalesce(rec.pets, '{}'::text[]))
        LIMIT 1;
      END IF;

      IF v_trait IS NULL
         AND rec.relationship_intent IS NOT NULL
         AND rec.relationship_intent = v_candidate.relationship_intent THEN
        v_trait := initcap(replace(v_candidate.relationship_intent, '_', ' '));
      END IF;

      IF v_trait IS NULL THEN
        v_trait := (coalesce(v_candidate.interests, '{}'::text[]))[1];
      END IF;

      v_age := CASE WHEN v_candidate.date_of_birth IS NOT NULL
        THEN extract(year from age(v_candidate.date_of_birth))::int
        ELSE NULL END;

      v_title := coalesce(nullif(rec.first_name, ''), 'Someone') || ', you might like…';

      v_body := coalesce(nullif(v_candidate.first_name, ''), 'Someone new');
      IF v_age IS NOT NULL THEN
        v_body := v_body || ' • ' || v_age::text;
      END IF;
      IF v_candidate.city IS NOT NULL AND v_candidate.city <> '' THEN
        v_body := v_body || ' • ' || initcap(v_candidate.city);
      END IF;
      IF v_trait IS NOT NULL AND v_trait <> '' THEN
        v_body := v_body || ' • ' || v_trait;
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
            'profileId', v_candidate_id,
            'senderId', v_candidate_id
          )
        )
      );

      UPDATE public.profiles
      SET last_recommendation_sent_date = v_today,
          recommendation_sends_today = v_sends_today + 1,
          last_recommendation_sent_at = now(),
          last_recommended_profile_id = v_candidate_id
      WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_recommendation_notifications: skipping user % after error: %', rec.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;

-- Midday slot (replaces the old single 16:00 run) and an evening slot.
SELECT cron.unschedule('send-recommendation-notifications')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-recommendation-notifications');

SELECT cron.schedule(
  'send-recommendation-notifications-midday',
  '30 12 * * *',
  $$SELECT public.send_recommendation_notifications();$$
);

SELECT cron.schedule(
  'send-recommendation-notifications-evening',
  '30 19 * * *',
  $$SELECT public.send_recommendation_notifications();$$
);
