-- Captures a function + cron job that were created directly against
-- production (via SQL editor / dashboard) and were never checked into a
-- migration file, so a fresh environment built from this repo's migrations
-- would be missing this notification entirely.
--
-- send_reengagement_notifications() pings users who have been inactive for
-- 24+ hours with a "meet {candidate}" push, rate-limited per user (10h for
-- premium, 24h for free). This migration reproduces the function body as it
-- exists live, except it now reads the internal auth token from
-- public.internal_secrets (key 'notification_cron_anon_key') instead of
-- hardcoding it inline, so this file doesn't commit a literal bearer token
-- to source control - same secret value, same behavior, safer to store.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_reengagement_sent_at timestamptz;

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
  v_traits text[];
  v_more text[];
  v_age integer;
  v_location text;
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

    v_traits := array[]::text[];

    select array_agg(x) into v_more from (
      select x from unnest(coalesce(rec.interests, '{}'::text[])) x
      where x = any(coalesce(v_candidate.interests, '{}'::text[])) limit 2
    ) s;
    if v_more is not null then v_traits := v_traits || v_more; end if;

    if array_length(v_traits,1) is null or array_length(v_traits,1) < 2 then
      select array_agg(x) into v_more from (
        select x from unnest(coalesce(rec.languages, '{}'::text[])) x
        where x = any(coalesce(v_candidate.languages, '{}'::text[])) limit 2
      ) s;
      if v_more is not null then v_traits := v_traits || v_more; end if;
    end if;

    if array_length(v_traits,1) is null or array_length(v_traits,1) < 2 then
      select array_agg(x) into v_more from (
        select x from unnest(coalesce(rec.pets, '{}'::text[])) x
        where x = any(coalesce(v_candidate.pets, '{}'::text[])) limit 2
      ) s;
      if v_more is not null then v_traits := v_traits || v_more; end if;
    end if;

    if (array_length(v_traits,1) is null or array_length(v_traits,1) < 2)
       and exists (
         select 1 from unnest(coalesce(rec.adinkra_symbols, '{}'::text[])) x
         where x = any(coalesce(v_candidate.adinkra_symbols, '{}'::text[]))
       ) then
      v_traits := array_append(v_traits, 'the same sign');
    end if;

    if (array_length(v_traits,1) is null or array_length(v_traits,1) < 2)
       and exists (
         select 1 from unnest(coalesce(rec.communication_style, '{}'::text[])) x
         where x = any(coalesce(v_candidate.communication_style, '{}'::text[]))
       ) then
      v_traits := array_append(v_traits, 'the same communication style');
    end if;

    if (array_length(v_traits,1) is null or array_length(v_traits,1) < 2)
       and exists (
         select 1 from unnest(coalesce(rec.love_style, '{}'::text[])) x
         where x = any(coalesce(v_candidate.love_style, '{}'::text[]))
       ) then
      v_traits := array_append(v_traits, 'the same love language');
    end if;

    if (array_length(v_traits,1) is null or array_length(v_traits,1) < 2)
       and rec.relationship_intent is not null
       and rec.relationship_intent = v_candidate.relationship_intent then
      v_traits := array_append(v_traits, 'what you''re both looking for');
    end if;

    if (array_length(v_traits,1) is null or array_length(v_traits,1) < 2)
       and rec.family_plans is not null
       and rec.family_plans = v_candidate.family_plans then
      v_traits := array_append(v_traits, 'your family plans');
    end if;

    v_age := case when v_candidate.date_of_birth is not null
      then extract(year from age(v_candidate.date_of_birth))::int
      else null end;

    v_location := nullif(
      trim(both ', ' from
        coalesce(v_candidate.city, '') ||
        case when v_candidate.city is not null and v_candidate.city <> '' and v_candidate.country is not null and v_candidate.country <> '' then ', ' else '' end ||
        coalesce(v_candidate.country, '')
      ),
      ''
    );

    v_title := rec.first_name || ', meet ' || v_candidate.first_name || ' 👋';

    v_body := v_candidate.first_name;
    if v_age is not null then
      v_body := v_body || ', ' || v_age::text;
    end if;
    if v_location is not null then
      v_body := v_body || ' · ' || v_location;
    end if;

    if coalesce(array_length(v_traits,1), 0) >= 2 then
      v_body := v_body || '. ' || v_traits[1] || ' and ' || v_traits[2] || ' - in common, Find out more!';
    elsif coalesce(array_length(v_traits,1), 0) = 1 then
      v_body := v_body || '. ' || v_traits[1] || ' - in common, Find out more!';
    else
      v_body := v_body || '. We think you two would hit it off. Find out why!';
    end if;

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
  end loop;
end;
$function$;

SELECT cron.schedule(
  'send-reengagement-notifications-hourly',
  '0 * * * *',
  $$select public.send_reengagement_notifications();$$
);
