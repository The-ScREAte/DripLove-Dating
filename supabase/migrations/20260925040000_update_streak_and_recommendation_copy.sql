-- Two changes:
--
-- 1. Streak broken copy -> "Killed your streak" /
--    "Come back and get yourself prioritized."
--
-- 2. send_recommendation_notifications() now behaves like
--    send_reengagement_notifications(): same candidate source, same
--    personalised body, only the title differs.
--
--    The bug this fixes: it used to run its OWN standalone candidate query,
--    completely independent of what the user actually sees in their Circle.
--    So it happily named someone who wasn't in that user's recommended row
--    at all - the push says "you might like X", the user opens Circle, and
--    X isn't there (and may not even be eligible to show, in which case
--    CirclePage's deep link just reports "Profile unavailable"). It now
--    reads public.circle_row_batches (row_key = 'recommended') first - the
--    exact precomputed row the Circle tab renders - and only falls back to a
--    fresh eligibility query when that row is empty. The fallback also now
--    requires an approved photo, since a profile without one never surfaces
--    in Circle either.
--
--    Audience, per-day dedup (last_recommendation_sent_date) and
--    least-recently-notified rotation are all unchanged.

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
  v_candidate_id uuid;
  v_candidate record;
  v_traits text[];
  v_more text[];
  v_age integer;
  v_location text;
  v_title text;
  v_body text;
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  FOR rec IN
    SELECT p.id, p.first_name, p.interests, p.languages, p.pets,
           p.adinkra_symbols, p.communication_style, p.love_style,
           p.relationship_intent, p.family_plans,
           p.gender, p.preference, p.country_code, p.latitude, p.longitude,
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
    BEGIN
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

      -- The row the Circle tab actually renders, so the person named in the
      -- push is the same person waiting for them when they open it.
      v_candidate_id := NULL;
      SELECT pid INTO v_candidate_id
      FROM (
        SELECT unnest(profile_ids) AS pid
        FROM public.circle_row_batches
        WHERE user_id = rec.id AND row_key = 'recommended'
      ) candidates
      WHERE NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = rec.id AND l.liked_id = candidates.pid)
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
      LIMIT 1;

      IF v_candidate_id IS NULL THEN
        SELECT c.id INTO v_candidate_id
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
          c.feed_random_weight
        LIMIT 1;
      END IF;

      IF v_candidate_id IS NULL THEN
        UPDATE public.profiles SET last_recommendation_sent_date = v_today WHERE id = rec.id;
        CONTINUE;
      END IF;

      SELECT first_name, date_of_birth, city, country, interests, languages,
             pets, adinkra_symbols, communication_style, love_style,
             relationship_intent, family_plans
      INTO v_candidate
      FROM public.profiles
      WHERE id = v_candidate_id;

      v_traits := ARRAY[]::text[];

      SELECT array_agg(x) INTO v_more FROM (
        SELECT x FROM unnest(coalesce(rec.interests, '{}'::text[])) x
        WHERE x = ANY(coalesce(v_candidate.interests, '{}'::text[])) LIMIT 2
      ) s;
      IF v_more IS NOT NULL THEN v_traits := v_traits || v_more; END IF;

      IF array_length(v_traits,1) IS NULL OR array_length(v_traits,1) < 2 THEN
        SELECT array_agg(x) INTO v_more FROM (
          SELECT x FROM unnest(coalesce(rec.languages, '{}'::text[])) x
          WHERE x = ANY(coalesce(v_candidate.languages, '{}'::text[])) LIMIT 2
        ) s;
        IF v_more IS NOT NULL THEN v_traits := v_traits || v_more; END IF;
      END IF;

      IF array_length(v_traits,1) IS NULL OR array_length(v_traits,1) < 2 THEN
        SELECT array_agg(x) INTO v_more FROM (
          SELECT x FROM unnest(coalesce(rec.pets, '{}'::text[])) x
          WHERE x = ANY(coalesce(v_candidate.pets, '{}'::text[])) LIMIT 2
        ) s;
        IF v_more IS NOT NULL THEN v_traits := v_traits || v_more; END IF;
      END IF;

      IF (array_length(v_traits,1) IS NULL OR array_length(v_traits,1) < 2)
         AND EXISTS (
           SELECT 1 FROM unnest(coalesce(rec.adinkra_symbols, '{}'::text[])) x
           WHERE x = ANY(coalesce(v_candidate.adinkra_symbols, '{}'::text[]))
         ) THEN
        v_traits := array_append(v_traits, 'the same sign');
      END IF;

      IF (array_length(v_traits,1) IS NULL OR array_length(v_traits,1) < 2)
         AND EXISTS (
           SELECT 1 FROM unnest(coalesce(rec.communication_style, '{}'::text[])) x
           WHERE x = ANY(coalesce(v_candidate.communication_style, '{}'::text[]))
         ) THEN
        v_traits := array_append(v_traits, 'the same communication style');
      END IF;

      IF (array_length(v_traits,1) IS NULL OR array_length(v_traits,1) < 2)
         AND EXISTS (
           SELECT 1 FROM unnest(coalesce(rec.love_style, '{}'::text[])) x
           WHERE x = ANY(coalesce(v_candidate.love_style, '{}'::text[]))
         ) THEN
        v_traits := array_append(v_traits, 'the same love language');
      END IF;

      IF (array_length(v_traits,1) IS NULL OR array_length(v_traits,1) < 2)
         AND rec.relationship_intent IS NOT NULL
         AND rec.relationship_intent = v_candidate.relationship_intent THEN
        v_traits := array_append(v_traits, 'what you''re both looking for');
      END IF;

      IF (array_length(v_traits,1) IS NULL OR array_length(v_traits,1) < 2)
         AND rec.family_plans IS NOT NULL
         AND rec.family_plans = v_candidate.family_plans THEN
        v_traits := array_append(v_traits, 'your family plans');
      END IF;

      v_age := CASE WHEN v_candidate.date_of_birth IS NOT NULL
        THEN extract(year from age(v_candidate.date_of_birth))::int
        ELSE NULL END;

      v_location := nullif(
        trim(both ', ' from
          coalesce(v_candidate.city, '') ||
          CASE WHEN v_candidate.city IS NOT NULL AND v_candidate.city <> '' AND v_candidate.country IS NOT NULL AND v_candidate.country <> '' THEN ', ' ELSE '' END ||
          coalesce(v_candidate.country, '')
        ),
        ''
      );

      -- Only the title differs from the re-engagement push.
      v_title := coalesce(nullif(rec.first_name, ''), 'Someone') || ', you might like…';

      v_body := v_candidate.first_name;
      IF v_age IS NOT NULL THEN
        v_body := v_body || ', ' || v_age::text;
      END IF;
      IF v_location IS NOT NULL THEN
        v_body := v_body || ' · ' || v_location;
      END IF;

      IF coalesce(array_length(v_traits,1), 0) >= 2 THEN
        v_body := v_body || '. ' || v_traits[1] || ' and ' || v_traits[2] || ' - in common, Find out more!';
      ELSIF coalesce(array_length(v_traits,1), 0) = 1 THEN
        v_body := v_body || '. ' || v_traits[1] || ' - in common, Find out more!';
      ELSE
        v_body := v_body || '. We think you two would hit it off. Find out why!';
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

      UPDATE public.profiles SET last_recommendation_sent_date = v_today WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      -- One user's failure must not abort the whole daily batch.
      RAISE WARNING 'send_recommendation_notifications: skipping user % after error: %', rec.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;
