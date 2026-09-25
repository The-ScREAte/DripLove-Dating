-- Two profile pushes a day for EVERY user (not just premium), from two
-- different sources, plus matching short copy on the re-engagement push.
--
-- 1. The function now takes p_row_key and is scheduled twice:
--      12:30 UTC -> 'recommended'  ("<Name>, you might like…")
--      19:30 UTC -> 'similar'      ("<Name>, you have a lot in common")
--    Each slot has its own per-day marker so one can never consume the
--    other's turn, and a shared 6h minimum gap stops them stacking if a run
--    is ever retried or duplicated. Both land on :30 because every other
--    notification job runs on the hour.
--
-- 2. Premium no longer changes HOW MANY pushes you get - everyone gets two.
--    Premium still widens the candidate pool (unlocked countries) in the
--    fallback query, which is what it actually pays for.
--
-- 3. Candidate source, in order:
--      a. the matching circle_row_batches row - exactly what the Circle tab
--         renders, so the person named is the person waiting there;
--      b. if that row is empty, the next card from the Discover deck
--         (same eligibility, ordered by feed_random_weight, which is the
--         deck's own ordering) - a user with an empty Circle still gets a
--         real, reachable person instead of silence. That case always uses
--         the "you might like…" title, since it isn't a Circle row.
--    Either way the person sent last time is excluded, so the two daily
--    pushes are never the same profile.

-- 4. Copy is now built by two shared helpers used by BOTH the recommendation
--    and re-engagement pushes, so the two can't drift apart again. The body
--    is plain bulleted facts - "Ikenna • 36 • Delta • Travel" - rather than
--    the sentence the re-engagement push used to end with ("... in common,
--    Find out more!"), which read awkwardly in a notification.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_similar_sent_date date;

-- One short label, never a sentence: a shared interest reads best, then a
-- shared language, then a shared pet, then what they're both here for, and
-- failing all that the candidate's own first interest so the slot still says
-- something real about them.
CREATE OR REPLACE FUNCTION public.pick_shared_trait(
  p_viewer_interests text[],
  p_viewer_languages text[],
  p_viewer_pets text[],
  p_viewer_intent text,
  p_candidate_interests text[],
  p_candidate_languages text[],
  p_candidate_pets text[],
  p_candidate_intent text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_trait text;
BEGIN
  SELECT x INTO v_trait
  FROM unnest(coalesce(p_candidate_interests, '{}'::text[])) x
  WHERE x = ANY(coalesce(p_viewer_interests, '{}'::text[]))
  LIMIT 1;

  IF v_trait IS NULL THEN
    SELECT x INTO v_trait
    FROM unnest(coalesce(p_candidate_languages, '{}'::text[])) x
    WHERE x = ANY(coalesce(p_viewer_languages, '{}'::text[]))
    LIMIT 1;
  END IF;

  IF v_trait IS NULL THEN
    SELECT x INTO v_trait
    FROM unnest(coalesce(p_candidate_pets, '{}'::text[])) x
    WHERE x = ANY(coalesce(p_viewer_pets, '{}'::text[]))
    LIMIT 1;
  END IF;

  IF v_trait IS NULL
     AND p_viewer_intent IS NOT NULL
     AND p_viewer_intent = p_candidate_intent THEN
    v_trait := initcap(replace(p_candidate_intent, '_', ' '));
  END IF;

  IF v_trait IS NULL THEN
    v_trait := (coalesce(p_candidate_interests, '{}'::text[]))[1];
  END IF;

  RETURN nullif(trim(coalesce(v_trait, '')), '');
END;
$function$;

-- "Ikenna • 36 • Delta • Travel". Every segment after the name is optional;
-- a missing age, city or trait is left out rather than leaving a stray
-- separator behind.
CREATE OR REPLACE FUNCTION public.build_profile_push_body(
  p_first_name text,
  p_age integer,
  p_city text,
  p_trait text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_body text;
BEGIN
  v_body := coalesce(nullif(trim(coalesce(p_first_name, '')), ''), 'Someone new');

  IF p_age IS NOT NULL THEN
    v_body := v_body || ' • ' || p_age::text;
  END IF;

  IF nullif(trim(coalesce(p_city, '')), '') IS NOT NULL THEN
    v_body := v_body || ' • ' || initcap(trim(p_city));
  END IF;

  IF nullif(trim(coalesce(p_trait, '')), '') IS NOT NULL THEN
    v_body := v_body || ' • ' || trim(p_trait);
  END IF;

  RETURN v_body;
END;
$function$;

DROP FUNCTION IF EXISTS public.send_recommendation_notifications();

CREATE OR REPLACE FUNCTION public.send_recommendation_notifications(p_row_key text DEFAULT 'recommended')
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
  v_from_circle boolean;
  v_already_sent boolean;
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_min_gap interval := interval '6 hours';
BEGIN
  IF p_row_key NOT IN ('recommended', 'similar') THEN
    RAISE EXCEPTION 'send_recommendation_notifications: unsupported row key %', p_row_key;
  END IF;

  FOR rec IN
    SELECT p.id, p.first_name, p.interests, p.languages, p.pets,
           p.relationship_intent, p.gender, p.preference, p.country_code,
           p.latitude, p.longitude, p.max_distance, p.min_age, p.max_age,
           p.unlocked_countries, p.last_recommendation_sent_date,
           p.last_similar_sent_date, p.last_recommendation_sent_at,
           p.last_recommended_profile_id
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.country_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
      AND CASE p_row_key
            WHEN 'recommended' THEN p.last_recommendation_sent_date IS DISTINCT FROM v_today
            ELSE p.last_similar_sent_date IS DISTINCT FROM v_today
          END
      AND (
        p.last_recommendation_sent_at IS NULL
        OR p.last_recommendation_sent_at < now() - interval '6 hours'
      )
    ORDER BY p.last_recommendation_sent_at NULLS FIRST
    LIMIT 20000
  LOOP
    BEGIN
      v_already_sent := CASE p_row_key
        WHEN 'recommended' THEN rec.last_recommendation_sent_date = v_today
        ELSE rec.last_similar_sent_date = v_today
      END;
      IF v_already_sent THEN
        CONTINUE;
      END IF;

      IF rec.last_recommendation_sent_at IS NOT NULL
         AND rec.last_recommendation_sent_at > now() - v_min_gap THEN
        CONTINUE;
      END IF;

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

      v_candidate_id := NULL;
      v_from_circle := true;

      SELECT pid INTO v_candidate_id
      FROM (
        SELECT unnest(profile_ids) AS pid
        FROM public.circle_row_batches
        WHERE user_id = rec.id AND row_key = p_row_key
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

      -- Nothing in that Circle row - fall back to the next card the Discover
      -- deck would show them. feed_random_weight is the deck's own ordering,
      -- so this really is "the next card", not an unrelated pick.
      IF v_candidate_id IS NULL THEN
        v_from_circle := false;
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
        ORDER BY c.feed_random_weight
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

      v_trait := public.pick_shared_trait(
        rec.interests, rec.languages, rec.pets, rec.relationship_intent,
        v_candidate.interests, v_candidate.languages, v_candidate.pets,
        v_candidate.relationship_intent
      );

      v_age := CASE WHEN v_candidate.date_of_birth IS NOT NULL
        THEN extract(year from age(v_candidate.date_of_birth))::int
        ELSE NULL END;

      -- A Discover-deck fallback isn't a Circle row, so it always reads as
      -- a plain recommendation regardless of which slot triggered it.
      IF p_row_key = 'similar' AND v_from_circle THEN
        v_title := coalesce(nullif(rec.first_name, ''), 'Someone') || ', you have a lot in common';
      ELSE
        v_title := coalesce(nullif(rec.first_name, ''), 'Someone') || ', you might like…';
      END IF;

      v_body := public.build_profile_push_body(
        v_candidate.first_name, v_age, v_candidate.city, v_trait
      );

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

      IF p_row_key = 'recommended' THEN
        UPDATE public.profiles
        SET last_recommendation_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = v_candidate_id
        WHERE id = rec.id;
      ELSE
        UPDATE public.profiles
        SET last_similar_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = v_candidate_id
        WHERE id = rec.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_recommendation_notifications(%): skipping user % after error: %', p_row_key, rec.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;

SELECT cron.unschedule('send-recommendation-notifications-midday')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-recommendation-notifications-midday');

SELECT cron.unschedule('send-recommendation-notifications-evening')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-recommendation-notifications-evening');

SELECT cron.schedule(
  'send-recommendation-notifications-midday',
  '30 12 * * *',
  $$SELECT public.send_recommendation_notifications('recommended');$$
);

SELECT cron.schedule(
  'send-recommendation-notifications-evening',
  '30 19 * * *',
  $$SELECT public.send_recommendation_notifications('similar');$$
);

-- Re-engagement push: same short body as the recommendation push, via the
-- shared helpers above. Only its title stays distinct ("<You>, meet <X> ").
-- Selection logic, rate limits and error isolation are untouched.
CREATE OR REPLACE FUNCTION public.send_reengagement_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec record;
  v_is_premium boolean;
  v_candidate_id uuid;
  v_candidate record;
  v_trait text;
  v_age integer;
  v_title text;
  v_body text;
begin
  for rec in
    select p.id as user_id, p.first_name, p.interests, p.languages, p.pets,
           p.adinkra_symbols, p.communication_style, p.love_style,
           p.relationship_intent, p.family_plans,
           p.gender, p.preference, p.country_code, p.last_reengagement_sent_at
    from public.profiles p
    where p.account_status = 'active'
      and p.is_admin is not true
      and p.last_login_at is not null
      and p.last_login_at < now() - interval '24 hours'
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
      and (
        p.last_reengagement_sent_at is null
        or p.last_reengagement_sent_at < now() - interval '10 hours'
      )
    order by p.last_reengagement_sent_at nulls first
    limit 2000
  loop
    -- Isolates one user's failure (a slow query, an unexpected null, a
    -- transient error) from the rest of the batch - see migration header.
    begin
      select exists (
        select 1 from public.user_subscriptions us
        where us.user_id = rec.user_id
          and us.plan_name = 'premium'
          and us.status in ('active', 'cancelled')
          and (us.expires_at is null or us.expires_at > now())
      ) into v_is_premium;

      if v_is_premium then
        if rec.last_reengagement_sent_at is not null and rec.last_reengagement_sent_at > now() - interval '10 hours' then
          continue;
        end if;
      else
        if rec.last_reengagement_sent_at is not null and rec.last_reengagement_sent_at > now() - interval '24 hours' then
          continue;
        end if;
      end if;

      v_candidate_id := null;
      select pid into v_candidate_id
      from (
        select unnest(profile_ids) as pid
        from public.circle_row_batches
        where user_id = rec.user_id and row_key = 'recommended'
      ) candidates
      where not exists (select 1 from public.likes l where l.liker_id = rec.user_id and l.liked_id = candidates.pid)
        and not exists (select 1 from public.passes ps where ps.passer_id = rec.user_id and ps.passed_id = candidates.pid)
        and not exists (
          select 1 from public.matches m
          where (m.user1_id = rec.user_id and m.user2_id = candidates.pid)
             or (m.user2_id = rec.user_id and m.user1_id = candidates.pid)
        )
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = rec.user_id and b.blocked_id = candidates.pid)
             or (b.blocker_id = candidates.pid and b.blocked_id = rec.user_id)
        )
      limit 1;

      if v_candidate_id is null then
        select cand.id into v_candidate_id
        from public.profiles cand
        where cand.account_status = 'active'
          and cand.is_admin is not true
          and cand.is_archived is not true
          and cand.id <> rec.user_id
          and cand.country_code = rec.country_code
          and (rec.preference = 'everyone' or cand.gender = rec.preference)
          and (cand.preference = 'everyone' or cand.preference = rec.gender)
          and exists (
            select 1 from public.user_images ui
            where ui.user_id = cand.id and ui.is_approved = true and ui.image_order <> -1
          )
          and not exists (select 1 from public.likes l where l.liker_id = rec.user_id and l.liked_id = cand.id)
          and not exists (select 1 from public.passes ps where ps.passer_id = rec.user_id and ps.passed_id = cand.id)
          and not exists (
            select 1 from public.matches m
            where (m.user1_id = rec.user_id and m.user2_id = cand.id)
               or (m.user2_id = rec.user_id and m.user1_id = cand.id)
          )
          and not exists (
            select 1 from public.blocks b
            where (b.blocker_id = rec.user_id and b.blocked_id = cand.id)
               or (b.blocker_id = cand.id and b.blocked_id = rec.user_id)
          )
        order by
          (coalesce(rec.interests, '{}'::text[]) && coalesce(cand.interests, '{}'::text[])) desc,
          cand.feed_random_weight
        limit 1;
      end if;

      if v_candidate_id is null then
        continue;
      end if;

      select first_name, date_of_birth, city, country, interests, languages,
             pets, adinkra_symbols, communication_style, love_style,
             relationship_intent, family_plans
      into v_candidate
      from public.profiles
      where id = v_candidate_id;

      v_trait := public.pick_shared_trait(
      rec.interests, rec.languages, rec.pets, rec.relationship_intent,
      v_candidate.interests, v_candidate.languages, v_candidate.pets,
      v_candidate.relationship_intent
    );

    v_age := case when v_candidate.date_of_birth is not null
        then extract(year from age(v_candidate.date_of_birth))::int
        else null end;

      v_title := rec.first_name || ', meet ' || v_candidate.first_name || ' 👋';

      v_body := public.build_profile_push_body(
      v_candidate.first_name, v_age, v_candidate.city, v_trait
    );

    perform net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'userId', rec.user_id,
          'type', 'system',
          'data', jsonb_build_object(
            'action', 'open_circle_profile',
            'profileId', v_candidate_id,
            'senderId', v_candidate_id
          )
        )
      );

      update public.profiles set last_reengagement_sent_at = now() where id = rec.user_id;
    exception when others then
      raise warning 'send_reengagement_notifications: skipping user % after error: %', rec.user_id, sqlerrm;
    end;
  end loop;
end;
$function$;
