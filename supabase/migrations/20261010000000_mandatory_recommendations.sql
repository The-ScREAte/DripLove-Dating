-- Daily recommendation pushes are mandatory.
--
-- "Ama, you might like..." (local midday) and "Ama, you have a lot in common"
-- (local evening) now go to every member with the app every day, active or
-- away, like the two daily pushes:
--
--  * Their own category ('recommendation'): not limited by the daily budget,
--    smart quiet's 4 hours or members' activity - only never 10pm-8am.
--  * Tried hourly inside the window (midday 11am-2:59pm, evening 6-8:59pm,
--    starting at a random one of the first two hours). An hour is skipped if
--    they're in the app right then (or just got a like, match or message) or
--    had another push in the last 45 minutes; the window's last hour sends
--    regardless.
--  * Always something to recommend: their Circle row, then the next Discover
--    card, then anyone suitable in their countries without the age/distance
--    limits; if there's truly nobody, a general "new people to discover"
--    version goes out instead of nothing.

create or replace function public.push_eligibility(p_user_id uuid, p_category text, p_kind text, p_dedupe_key text default null::text)
returns table(allowed boolean, reason text, tier text, local_hour integer)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_status text; v_permission text; v_tz text; v_country text; v_last timestamptz; v_tier text; v_hour integer;
  v_cat text := lower(coalesce(nullif(p_category, ''), 'engagement'));
  v_gate text;
begin
  select p.account_status, p.notification_permission, p.timezone, p.country_code
    into v_status, v_permission, v_tz, v_country
  from public.profiles p where p.id = p_user_id;
  if not found then
    return query select false, 'no_profile'::text, null::text, null::integer; return;
  end if;

  v_last := public.user_last_active_at(p_user_id);
  v_tier := case
    when v_last is null then 'dormant'
    when v_last > now() - interval '7 days' then 'active'
    when v_last > now() - interval '30 days' then 'lapsed'
    when v_last > now() - interval '60 days' then 'inactive'
    else 'dormant' end;

  begin
    v_hour := extract(hour from (now() at time zone public.user_timezone(v_tz, v_country)))::integer;
  exception when others then
    v_hour := extract(hour from (now() at time zone 'UTC'))::integer;
  end;

  if coalesce(v_status, 'active') <> 'active' then
    return query select false, 'account_not_active'::text, v_tier, v_hour; return; end if;
  if not exists (select 1 from public.push_tokens t where t.user_id = p_user_id) then
    return query select false, 'no_device'::text, v_tier, v_hour; return; end if;
  if v_permission = 'denied' then
    return query select false, 'notifications_off'::text, v_tier, v_hour; return; end if;
  if p_dedupe_key is not null and exists (
    select 1 from public.push_delivery_log l
    where l.user_id = p_user_id and l.dedupe_key = p_dedupe_key
      and l.decision = 'sent' and l.created_at > now() - interval '30 minutes') then
    return query select false, 'duplicate'::text, v_tier, v_hour; return; end if;

  if v_cat in ('transactional', 'event', 'broadcast') then
    return query select true, v_cat, v_tier, v_hour; return; end if;

  -- Daily recommendations are mandatory: only never at night.
  if v_cat = 'recommendation' then
    if v_hour >= 22 or v_hour < 8 then
      return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
    return query select true, v_cat, v_tier, v_hour; return;
  end if;

  if v_tier in ('inactive', 'dormant') then
    return query select false, 'inactive_no_engagement'::text, v_tier, v_hour; return; end if;
  if v_hour >= 22 or v_hour < 8 then
    return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;

  select h.hold_reason into v_gate from public.marketing_push_hold(p_user_id, false) h;
  if v_gate is not null then
    return query select false, v_gate, v_tier, v_hour; return; end if;
  return query select true, ('engagement_' || v_tier)::text, v_tier, v_hour;
end;
$function$;

create or replace function public.send_recommendation_notifications(p_row_key text default 'recommended'::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_data jsonb;
  v_name text;
  v_from_circle boolean;
  v_last_hour boolean;
  v_hold text;
  v_today date;
  v_first_hour integer;
  v_end_hour integer;
  v_min_gap interval := interval '3 hours';
BEGIN
  IF p_row_key NOT IN ('recommended', 'similar') THEN
    RAISE EXCEPTION 'send_recommendation_notifications: unsupported row key %', p_row_key;
  END IF;
  v_first_hour := CASE p_row_key WHEN 'recommended' THEN 11 ELSE 18 END;
  v_end_hour := CASE p_row_key WHEN 'recommended' THEN 14 ELSE 20 END;

  FOR rec IN
    SELECT p.id, p.first_name, p.interests, p.languages, p.pets,
           p.relationship_intent, p.gender, p.preference, p.country_code,
           p.latitude, p.longitude, p.max_distance, p.min_age, p.max_age,
           p.unlocked_countries, p.last_recommendation_sent_date,
           p.last_similar_sent_date, p.last_recommendation_sent_at,
           p.last_recommended_profile_id, z.tz, z.local_hour
    FROM public.profiles p
    CROSS JOIN LATERAL (
      SELECT public.user_timezone(p.timezone, p.country_code) AS tz,
             extract(hour from (now() AT TIME ZONE public.user_timezone(p.timezone, p.country_code)))::integer AS local_hour
    ) z
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND coalesce(p.notification_permission, '') <> 'denied'
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
      AND z.local_hour BETWEEN v_first_hour + mod(abs(hashtext(p.id::text || ((now() AT TIME ZONE z.tz)::date)::text)), 2)
                           AND v_end_hour
      AND CASE p_row_key
            WHEN 'recommended' THEN p.last_recommendation_sent_date IS DISTINCT FROM (now() AT TIME ZONE z.tz)::date
            ELSE p.last_similar_sent_date IS DISTINCT FROM (now() AT TIME ZONE z.tz)::date
          END
      AND (p.last_recommendation_sent_at IS NULL
           OR p.last_recommendation_sent_at < now() - v_min_gap
           OR z.local_hour >= v_end_hour)
    ORDER BY p.last_recommendation_sent_at NULLS FIRST
    LIMIT 20000
  LOOP
    BEGIN
      v_today := (now() AT TIME ZONE rec.tz)::date;
      v_last_hour := rec.local_hour >= v_end_hour;

      -- In the app right now, just got a like/match/message, or another push
      -- in the last 45 minutes: try next hour. The last hour sends regardless.
      IF NOT v_last_hour THEN
        SELECT h.hold_reason INTO v_hold FROM public.marketing_push_hold(rec.id, false, false, true) h;
        CONTINUE WHEN v_hold IS NOT NULL;
        CONTINUE WHEN EXISTS (
          SELECT 1 FROM public.push_delivery_log l
          WHERE l.user_id = rec.id AND l.decision = 'sent' AND l.created_at > now() - interval '45 minutes');
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.user_subscriptions s
        WHERE s.user_id = rec.id
          AND s.plan_name = 'premium'
          AND s.status IN ('active', 'cancelled')
          AND (s.expires_at IS NULL OR s.expires_at > now())
      ) INTO v_is_premium;

      v_countries := array_remove(ARRAY[rec.country_code], NULL);
      IF v_is_premium AND rec.unlocked_countries IS NOT NULL THEN
        v_countries := ARRAY(SELECT DISTINCT unnest(v_countries || rec.unlocked_countries));
      END IF;

      v_candidate_id := NULL;
      v_from_circle := true;

      -- 1. Their Circle row.
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

      -- 2. The next card their Discover deck would show.
      IF v_candidate_id IS NULL AND cardinality(v_countries) > 0 THEN
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

      -- 3. Anyone suitable in their countries, without the age and distance limits.
      IF v_candidate_id IS NULL AND cardinality(v_countries) > 0 THEN
        SELECT c.id INTO v_candidate_id
        FROM public.profiles c
        WHERE c.id <> rec.id
          AND (rec.last_recommended_profile_id IS NULL OR c.id <> rec.last_recommended_profile_id)
          AND c.account_status = 'active'
          AND c.is_admin IS NOT TRUE
          AND c.is_archived IS NOT TRUE
          AND c.country_code = ANY(v_countries)
          AND (c.preference = rec.gender OR c.preference = 'everyone' OR c.preference IS NULL)
          AND (rec.preference = 'everyone' OR rec.preference IS NULL OR c.gender = rec.preference)
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

      v_name := nullif(trim(rec.first_name), '');
      IF v_candidate_id IS NOT NULL THEN
        SELECT first_name, date_of_birth, city, interests, languages, pets, relationship_intent
        INTO v_candidate
        FROM public.profiles
        WHERE id = v_candidate_id;
        IF nullif(trim(v_candidate.first_name), '') IS NULL THEN
          v_candidate_id := NULL;
        END IF;
      END IF;

      IF v_candidate_id IS NOT NULL THEN
        v_trait := public.pick_shared_trait(
          rec.interests, rec.languages, rec.pets, rec.relationship_intent,
          v_candidate.interests, v_candidate.languages, v_candidate.pets,
          v_candidate.relationship_intent
        );
        v_age := CASE WHEN v_candidate.date_of_birth IS NOT NULL
          THEN extract(year from age(v_candidate.date_of_birth))::int
          ELSE NULL END;
        -- A Discover-deck pick isn't a Circle row, so it always reads as a
        -- plain recommendation.
        IF p_row_key = 'similar' AND v_from_circle THEN
          v_title := coalesce(v_name || ', you', 'You') || ' have a lot in common';
        ELSE
          v_title := coalesce(v_name || ', you', 'You') || ' might like…';
        END IF;
        v_body := public.build_profile_push_body(v_candidate.first_name, v_age, v_candidate.city, v_trait);
        v_data := jsonb_build_object('action', 'open_circle_profile', 'profileId', v_candidate_id, 'senderId', v_candidate_id);
      ELSIF p_row_key = 'similar' THEN
        -- 4. Nobody to show right now: still something worth opening.
        v_title := coalesce(v_name || ', people', 'People') || ' you might click with 💞';
        v_body := 'Open DripLove and see who shares your interests.';
        v_data := jsonb_build_object('action', 'open_discover');
      ELSE
        v_title := coalesce(v_name || ', new', 'New') || ' people to discover 💫';
        v_body := 'See who''s on DripLove today.';
        v_data := jsonb_build_object('action', 'open_discover');
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
          'category', 'recommendation',
          'kind', p_row_key,
          'dedupeKey', p_row_key || ':' || v_today::text,
          'data', v_data
        )
      );

      IF p_row_key = 'recommended' THEN
        UPDATE public.profiles
        SET last_recommendation_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = coalesce(v_candidate_id, last_recommended_profile_id)
        WHERE id = rec.id;
      ELSE
        UPDATE public.profiles
        SET last_similar_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = coalesce(v_candidate_id, last_recommended_profile_id)
        WHERE id = rec.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_recommendation_notifications(%): skipping user % after error: %', p_row_key, rec.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;
 