-- Boost, part 2: reach by plan, a push when a boost starts / ends, and a "good time to boost" evening nudge.
--
-- README
--  * Reach by plan. A FREE booster is put first only for viewers whose home country is the booster's own country.
--    A PREMIUM booster is put first for viewers in their home country AND in the countries they selected
--    (profiles.unlocked_countries). The viewer's own deck rules don't change (free viewer: home country only;
--    premium viewer: home + unlocked), so a premium booster's foreign reach lands with premium viewers who
--    unlocked the booster's country. Applies to get_boosted_profiles_for_me and to the live-boost slots of
--    get_random_discover_profiles. A booster outside their reach still shows up in the normal deck as before.
--  * Start push: activate_boost() sends "Boost is on" / "You're at the front for the next 15 minutes" (20 for
--    premium) through send-push-notification, category 'event', data.action 'open_boost'.
--  * End push: every 5 minutes, send_boost_end_pushes() tells a booster "Your boost has ended" with "Next free
--    boost tomorrow" (free) or "Boost again anytime" (premium) - only if they are NOT in the app (they already
--    see the countdown finish there), they haven't started another boost, and it isn't 22:00-08:00 local.
--    Category 'recommendation' so the night rule in push_eligibility applies and it doesn't eat the marketing
--    budget. Switch off with boost_settings().end_push = false.
--  * Nudge: hourly, send_boost_nudges() sends one short line ("Lots of people are online now. Good time to boost",
--    rotated) at most once a local day, only every 2-3 days per person, at a random minute between 18:00 and
--    21:30 local (sent on the first hourly run at or after it, never at or after 22:00), and only if the person
--    can boost right now, has a device, notifications aren't off, has used the app in the last 30 days, isn't in
--    the app right now and had no push in the last 45 minutes. Logged in boost_nudge_log (no client access).
--    Tap: data.action 'open_boost'. Category 'recommendation', kind 'boost_nudge'.
--  * All numbers are in public.boost_settings().

-- 1. Settings ---------------------------------------------------------------------------------------------------

create or replace function public.boost_settings()
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select jsonb_build_object(
    'free_minutes', 15,
    'premium_minutes', 20,
    'free_boosts_per_window', 1,
    'free_window_hours', 24,
    -- end push
    'end_push', true,
    'end_push_in_app_minutes', 10,
    -- evening nudge
    'nudge_enabled', true,
    'nudge_window_start_min', 18 * 60,       -- 18:00 local
    'nudge_window_end_min', 21 * 60 + 30,    -- random send minute is before 21:30
    'nudge_send_until_min', 22 * 60,         -- never at or after 22:00
    'nudge_min_gap_days', 2,
    'nudge_max_gap_days', 3,
    'nudge_active_within_days', 30,
    'nudge_recent_push_minutes', 45
  );
$function$;
revoke all on function public.boost_settings() from public, anon;
grant execute on function public.boost_settings() to authenticated;

-- 2. Columns + nudge log --------------------------------------------------------------------------------------------

alter table public.profile_boosts add column if not exists start_push_at timestamptz;
alter table public.profile_boosts add column if not exists end_push_at timestamptz;
alter table public.profile_boosts add column if not exists end_push_result text;

create table if not exists public.boost_nudge_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_day date not null,
  sent_at timestamptz not null default now(),
  variant integer not null,
  dedupe_key text not null,
  primary key (user_id, local_day)
);
alter table public.boost_nudge_log enable row level security;
revoke all on table public.boost_nudge_log from public, anon, authenticated;

-- 3. Helpers ------------------------------------------------------------------------------------------------------

-- Same push path as icebreaker_push / notify_like_received.
create or replace function public.boost_push(
  p_user uuid, p_title text, p_body text, p_category text, p_kind text, p_dedupe text, p_data jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'),
      'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
    ),
    body := jsonb_build_object(
      'title', p_title,
      'body', p_body,
      'userId', p_user,
      'type', 'system',
      'category', p_category,
      'kind', p_kind,
      'dedupeKey', p_dedupe,
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
exception when others then
  raise warning 'boost_push failed: %', sqlerrm;
end;
$function$;
revoke all on function public.boost_push(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;

-- Now takes a reference time (for the nudge planner and tests). One-argument calls keep working.
drop function if exists public.boost_next_free_at(uuid);
create or replace function public.boost_next_free_at(p_user uuid, p_now timestamptz default now())
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $function$
  with s as (
    select greatest(1, (public.boost_settings()->>'free_boosts_per_window')::int) as per_window,
           make_interval(hours => (public.boost_settings()->>'free_window_hours')::int) as win
  ), recent as (
    select b.started_at
    from public.profile_boosts b, s
    where b.user_id = p_user and b.kind = 'free'
      and b.started_at > coalesce(p_now, now()) - s.win and b.started_at <= coalesce(p_now, now())
  )
  select case
           when (select count(*) from recent) >= (select per_window from s)
           then (select r.started_at from recent r order by r.started_at desc
                 offset (select per_window - 1 from s) limit 1) + (select win from s)
         end;
$function$;
revoke all on function public.boost_next_free_at(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.boost_nudge_copy(p_variant integer, p_minutes integer)
returns table(title text, body text)
language sql
immutable
set search_path to ''
as $function$
  select v.title, v.body
  from (values
    (0, 'Good time to boost', 'Lots of people are online now. Good time to boost'),
    (1, 'Lots of people are online', 'Boost now and be the first profile they see'),
    (2, 'It''s busy right now', 'Boost for ' || p_minutes || ' minutes and get seen first'),
    (3, 'Evening rush', 'More people are swiping now. Boost to get seen first')
  ) as v(n, title, body)
  where v.n = mod(abs(coalesce(p_variant, 0)), 4);
$function$;
revoke all on function public.boost_nudge_copy(integer, integer) from public, anon, authenticated;

-- 4. activate_boost(): same contract, plus the start push ------------------------------------------------------------

create or replace function public.activate_boost()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_settings jsonb := public.boost_settings();
  v_active public.profile_boosts;
  v_premium boolean;
  v_kind text;
  v_minutes int;
  v_next timestamptz;
  v_row public.profile_boosts;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- One activation at a time per member (double taps, two devices).
  perform pg_advisory_xact_lock(hashtextextended('profile_boost:' || v_uid::text, 0));

  if not exists (select 1 from public.profiles p where p.id = v_uid and p.account_status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  select * into v_active from public.profile_boosts b
  where b.user_id = v_uid and b.started_at <= now() and b.ends_at > now()
  order by b.ends_at desc limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'already_active', 'ends_at', v_active.ends_at,
                              'boost_id', v_active.id, 'kind', v_active.kind);
  end if;

  v_premium := public.user_is_premium_now(v_uid);
  if v_premium then
    v_kind := 'premium';
    v_minutes := (v_settings->>'premium_minutes')::int;
  else
    v_next := public.boost_next_free_at(v_uid);
    if v_next is not null then
      return jsonb_build_object('ok', false, 'error', 'free_used', 'next_free_at', v_next);
    end if;
    v_kind := 'free';
    v_minutes := (v_settings->>'free_minutes')::int;
  end if;

  insert into public.profile_boosts (user_id, kind, started_at, ends_at, start_push_at)
  values (v_uid, v_kind, now(), now() + make_interval(mins => v_minutes), now())
  returning * into v_row;

  -- Sent when this transaction commits (pg_net); never blocks the boost.
  perform public.boost_push(
    v_uid, 'Boost is on', 'You''re at the front for the next ' || v_minutes || ' minutes',
    'event', 'boost_started', 'boost_start:' || v_row.id,
    jsonb_build_object('action', 'open_boost', 'boostId', v_row.id));

  return jsonb_build_object(
    'ok', true,
    'boost_id', v_row.id,
    'kind', v_row.kind,
    'started_at', v_row.started_at,
    'ends_at', v_row.ends_at,
    'duration_minutes', v_minutes,
    'is_premium', v_premium,
    'server_now', now()
  );
end;
$function$;
revoke all on function public.activate_boost() from public, anon;
grant execute on function public.activate_boost() to authenticated;

-- 5. get_boosted_profiles_for_me(): reach by the booster's plan ------------------------------------------------------

create or replace function public.get_boosted_profiles_for_me(p_limit integer default 5)
returns table(profile_id uuid, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_premium boolean;
  v_base text;
  v_countries text[];
  v_genders text[];
  v_pref text;
  v_my_gender text;
  v_min_age int;
  v_max_age int;
  v_max_km numeric;
  v_circle uuid[];
begin
  if v_uid is null then
    return;
  end if;
  select * into v_me from public.profiles p where p.id = v_uid;
  if not found then
    return;
  end if;

  v_premium := public.user_is_premium_now(v_uid);
  v_base := nullif(upper(trim(coalesce(v_me.country_code, ''))), '');
  -- The booster's reach is measured against the viewer's home country.
  if v_base is null then
    return;
  end if;
  v_countries := array[v_base];
  if v_premium then
    v_countries := v_countries || coalesce(
      (select array_agg(distinct upper(trim(c))) from unnest(v_me.unlocked_countries) c where nullif(trim(c), '') is not null),
      '{}'::text[]);
  end if;

  v_pref := lower(coalesce(v_me.preference, 'everyone'));
  v_genders := case v_pref when 'male' then array['male'] when 'female' then array['female']
                           else array['male', 'female', 'other'] end;
  v_my_gender := lower(trim(coalesce(v_me.gender, '')));
  v_min_age := coalesce(nullif(v_me.min_age, 0), 18);
  v_max_age := coalesce(nullif(v_me.max_age, 0), 99);
  v_max_km := coalesce(v_me.max_distance::numeric, v_me.distance_preference::numeric, 50);
  if v_max_km is null or v_max_km <= 0 then
    v_max_km := 50;
  end if;
  v_max_km := least(v_max_km, 5000);

  select coalesce(array_agg(x), '{}'::uuid[]) into v_circle
  from public.circle_row_batches c, unnest(c.profile_ids) x
  where c.user_id = v_uid;

  return query
  with live as (
    select distinct on (b.user_id) b.user_id, b.ends_at, b.kind
    from public.profile_boosts b
    where b.ends_at > now() and b.started_at <= now() and b.user_id <> v_uid
    order by b.user_id, b.ends_at desc
  )
  select l.user_id, l.ends_at
  from live l
  join public.profiles p on p.id = l.user_id
  where p.account_status = 'active'
    and p.is_admin = false
    -- viewer side (the deck's rule)
    and upper(p.country_code) = any(v_countries)
    -- booster side: free = own country only; premium = own country + their selected countries
    and (upper(p.country_code) = v_base
         or (l.kind = 'premium'
             and exists (select 1 from unnest(p.unlocked_countries) uc where upper(trim(uc)) = v_base)))
    and p.gender = any(v_genders)
    and (lower(trim(coalesce(p.preference, ''))) in ('', 'everyone', 'both')
         or v_my_gender = '' or lower(trim(p.preference)) = v_my_gender)
    and (
      upper(p.country_code) is distinct from v_base
      or v_me.latitude is null or v_me.longitude is null or p.latitude is null or p.longitude is null
      or public.calculate_distance(v_me.latitude, v_me.longitude, p.latitude, p.longitude) <= v_max_km
    )
    and (
      case when p.date_of_birth is null then v_premium
           else extract(year from age(current_date, p.date_of_birth))::int between v_min_age and v_max_age end
    )
    and not exists (select 1 from public.likes lk where lk.liker_id = v_uid and lk.liked_id = p.id)
    and not exists (select 1 from public.passes ps where ps.passer_id = v_uid and ps.passed_id = p.id
                    and ps.passed_at > now() - interval '30 days')
    and not exists (select 1 from public.matches m
                    where (m.user1_id = v_uid and m.user2_id = p.id) or (m.user2_id = v_uid and m.user1_id = p.id))
    and not exists (select 1 from public.blocks bl
                    where (bl.blocker_id = v_uid and bl.blocked_id = p.id) or (bl.blocker_id = p.id and bl.blocked_id = v_uid))
    and not exists (select 1 from public.match_cooldowns mc
                    where mc.expires_at > now()
                      and ((mc.user1_id = v_uid and mc.user2_id = p.id) or (mc.user2_id = v_uid and mc.user1_id = p.id)))
    and not exists (select 1 from public.icebreakers i
                    where i.sender_id = v_uid and i.recipient_id = p.id
                      and ((i.status = 'pending' and i.expires_at > now()) or i.status = 'declined'))
    and not (p.id = any(v_circle))
  order by l.ends_at asc, random()
  limit greatest(1, least(coalesce(p_limit, 5), 20));
end;
$function$;
revoke all on function public.get_boosted_profiles_for_me(integer) from public, anon;
grant execute on function public.get_boosted_profiles_for_me(integer) to authenticated;

-- 6. get_random_discover_profiles: live-boost slots follow the same reach --------------------------------------------

create or replace function public.get_random_discover_profiles(
  p_country_codes text[], p_allowed_genders text[], p_archived boolean, p_excluded_ids uuid[] default '{}'::uuid[],
  p_limit integer default 100, p_lat double precision default null::double precision,
  p_lon double precision default null::double precision, p_radius_degrees double precision default null::double precision,
  p_allowed_ids uuid[] default null::uuid[]
)
returns setof public.profiles
language sql
stable
security definer
set search_path to ''
as $function$
  -- All steps repeat the same filters on purpose: sharing them through one
  -- CTE would materialize the whole pool and lose the index's early stop.
  with viewer as materialized (
    select upper(trim(v.country_code)) as home from public.profiles v where v.id = auth.uid()
  ),
  live_boosted as materialized (
    select p as prof, p.id, p.feed_random_weight as weight
    from (select distinct on (pb.user_id) pb.user_id, pb.kind
          from public.profile_boosts pb
          where pb.ends_at > now() and pb.started_at <= now()
          order by pb.user_id, pb.ends_at desc) lb
    join public.profiles p on p.id = lb.user_id
    cross join viewer vw
    where p.country_code = any(p_country_codes)
      and p.gender = any(p_allowed_genders)
      and p.account_status = 'active'
      and p.is_admin = false
      and p.is_archived = p_archived
      and not (p.id = any(coalesce(p_excluded_ids, array[]::uuid[])))
      and (p_allowed_ids is null or p.id = any(p_allowed_ids))
      and (
        p_lat is null or p_lon is null or p_radius_degrees is null
        or (
          p.latitude between p_lat - p_radius_degrees and p_lat + p_radius_degrees
          and p.longitude between p_lon - p_radius_degrees and p_lon + p_radius_degrees
        )
      )
      -- free booster: viewers in their own country; premium: also their selected countries
      and (upper(p.country_code) = vw.home
           or (lb.kind = 'premium'
               and exists (select 1 from unnest(p.unlocked_countries) uc where upper(trim(uc)) = vw.home)))
    order by p.feed_random_weight
    limit greatest(1, p_limit / 2)
  ),
  boosted as materialized (
    select p as prof, p.id, p.feed_random_weight as weight
    from public.feed_boosts b
    join public.profiles p on p.id = b.user_id
    where b.boost_until > now()
      and p.country_code = any(p_country_codes)
      and p.gender = any(p_allowed_genders)
      and p.account_status = 'active'
      and p.is_admin = false
      and p.is_archived = p_archived
      and not (p.id = any(coalesce(p_excluded_ids, array[]::uuid[])))
      and not (p.id = any(array(select lb.id from live_boosted lb)))
      and (p_allowed_ids is null or p.id = any(p_allowed_ids))
      and (
        p_lat is null or p_lon is null or p_radius_degrees is null
        or (
          p.latitude between p_lat - p_radius_degrees and p_lat + p_radius_degrees
          and p.longitude between p_lon - p_radius_degrees and p_lon + p_radius_degrees
        )
      )
    order by p.feed_random_weight
    limit greatest(0, greatest(1, p_limit / 2) - (select count(*) from live_boosted))
  )
  select (picked.prof).*
  from (
    select lb.prof, 0 as tier, lb.weight
    from live_boosted lb
    union all
    select bo.prof, 1, bo.weight
    from boosted bo
    union all
    (
      select p, 2, p.feed_random_weight
      from public.profiles p
      where p.country_code = any(p_country_codes)
        and p.gender = any(p_allowed_genders)
        and p.account_status = 'active'
        and p.is_admin = false
        and p.is_archived = p_archived
        and not (p.id = any(coalesce(p_excluded_ids, array[]::uuid[])))
        and not (p.id = any(array(select lb.id from live_boosted lb)))
        and not (p.id = any(array(select bo.id from boosted bo)))
        and (p_allowed_ids is null or p.id = any(p_allowed_ids))
        and (
          p_lat is null or p_lon is null or p_radius_degrees is null
          or (
            p.latitude between p_lat - p_radius_degrees and p_lat + p_radius_degrees
            and p.longitude between p_lon - p_radius_degrees and p_lon + p_radius_degrees
          )
        )
      order by p.feed_random_weight
      limit p_limit
    )
  ) picked
  order by picked.tier, picked.weight
  limit p_limit;
$function$;

revoke all on function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) from public, anon;
grant execute on function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) to authenticated;

-- 7. End push (every 5 minutes) ---------------------------------------------------------------------------------------
-- p_now / p_only_users are for tests; with a simulated p_now the "in the app right now" check is skipped.

create or replace function public.send_boost_end_pushes(p_now timestamptz default null, p_only_users uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_settings jsonb := public.boost_settings();
  v_now timestamptz := coalesce(p_now, now());
  v_live boolean := p_now is null or abs(extract(epoch from (p_now - now()))) < 120;
  rec record;
  v_hour int;
  v_result text;
  v_sent int := 0;
begin
  for rec in
    select b.id, b.user_id, b.kind, b.started_at, p.notification_permission,
           public.user_timezone(p.timezone, p.country_code) as tz
    from public.profile_boosts b
    join public.profiles p on p.id = b.user_id
    where b.end_push_at is null
      and b.ends_at <= v_now
      and b.ends_at > v_now - interval '30 minutes'
      and (p_only_users is null or b.user_id = any(p_only_users))
    for update of b skip locked
  loop
    begin
      v_result := null;
      begin
        v_hour := extract(hour from (v_now at time zone rec.tz))::int;
      exception when others then
        v_hour := extract(hour from (v_now at time zone 'UTC'))::int;
      end;

      if not coalesce((v_settings->>'end_push')::boolean, false) then
        v_result := 'disabled';
      elsif exists (select 1 from public.profile_boosts b2
                    where b2.user_id = rec.user_id and b2.started_at > rec.started_at and b2.started_at <= v_now) then
        v_result := 'boosted_again';
      elsif v_hour >= 22 or v_hour < 8 then
        v_result := 'quiet_hours';
      elsif coalesce(rec.notification_permission, '') = 'denied'
            or not exists (select 1 from public.push_tokens t where t.user_id = rec.user_id) then
        v_result := 'no_device';
      elsif v_live and public.user_last_active_at(rec.user_id)
                       > v_now - make_interval(mins => (v_settings->>'end_push_in_app_minutes')::int) then
        v_result := 'in_app';
      end if;

      if v_result is null then
        perform public.boost_push(
          rec.user_id, 'Your boost has ended',
          case when rec.kind = 'premium' then 'Boost again anytime' else 'Next free boost tomorrow' end,
          'recommendation', 'boost_ended', 'boost_end:' || rec.id,
          jsonb_build_object('action', 'open_boost', 'boostId', rec.id));
        v_result := 'sent';
        v_sent := v_sent + 1;
      end if;

      update public.profile_boosts set end_push_at = v_now, end_push_result = v_result where id = rec.id;
    exception when others then
      raise warning 'send_boost_end_pushes: skipping boost % after error: %', rec.id, sqlerrm;
    end;
  end loop;
  return v_sent;
end;
$function$;
revoke all on function public.send_boost_end_pushes(timestamptz, uuid[]) from public, anon, authenticated;

-- 8. "Good time to boost" nudge (hourly) -------------------------------------------------------------------------------
-- p_now / p_only_users are for tests; with a simulated p_now the "in the app / recent push" checks are skipped.

create or replace function public.send_boost_nudges(p_now timestamptz default null, p_only_users uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s jsonb := public.boost_settings();
  v_now timestamptz := coalesce(p_now, now());
  v_live boolean := p_now is null or abs(extract(epoch from (p_now - now()))) < 120;
  v_start int := (s->>'nudge_window_start_min')::int;
  v_end int := (s->>'nudge_window_end_min')::int;
  v_until int := (s->>'nudge_send_until_min')::int;
  v_min_gap int := (s->>'nudge_min_gap_days')::int;
  v_max_gap int := (s->>'nudge_max_gap_days')::int;
  rec record;
  v_local timestamp;
  v_day date;
  v_min int;
  v_slot int;
  v_last date;
  v_gap int;
  v_premium boolean;
  v_hold text;
  v_variant int;
  v_title text;
  v_body text;
  v_key text;
  v_sent int := 0;
begin
  if not coalesce((s->>'nudge_enabled')::boolean, false) then
    return 0;
  end if;

  for rec in
    select p.id, public.user_timezone(p.timezone, p.country_code) as tz
    from public.profiles p
    where p.account_status = 'active'
      and p.is_admin is not true
      and coalesce(p.notification_permission, '') <> 'denied'
      and exists (select 1 from public.push_tokens t where t.user_id = p.id)
      and (p_only_users is null or p.id = any(p_only_users))
  loop
    begin
      v_local := v_now at time zone rec.tz;
      v_day := v_local::date;
      v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;

      -- Evening only, never 22:00-08:00.
      continue when v_min < v_start or v_min >= v_until;
      -- Today's random minute in 18:00-21:30.
      v_slot := v_start + mod(abs(hashtext(rec.id::text || ':' || v_day::text || ':boost_nudge')), greatest(v_end - v_start, 1));
      continue when v_min < v_slot;
      -- Once a day at most.
      continue when exists (select 1 from public.boost_nudge_log g where g.user_id = rec.id and g.local_day = v_day);
      -- Every 2-3 days: the gap after each nudge is picked from the day it went out.
      select max(g.local_day) into v_last from public.boost_nudge_log g where g.user_id = rec.id and g.local_day < v_day;
      if v_last is null then
        -- First one: spread over the first two days so not everyone gets it the same evening.
        continue when mod(abs(hashtext(rec.id::text || ':' || v_day::text || ':first')), 2) = 1;
      else
        v_gap := v_min_gap + mod(abs(hashtext(rec.id::text || ':' || v_last::text || ':gap')), greatest(v_max_gap - v_min_gap + 1, 1));
        continue when (v_day - v_last) < v_gap;
      end if;
      -- Used the app recently enough for this to make sense.
      continue when coalesce(public.user_last_active_at(rec.id), '-infinity'::timestamptz)
                    < v_now - make_interval(days => (s->>'nudge_active_within_days')::int);
      -- Can boost right now.
      continue when exists (select 1 from public.profile_boosts b
                            where b.user_id = rec.id and b.started_at <= v_now and b.ends_at > v_now);
      v_premium := public.user_is_premium_now(rec.id);
      continue when not v_premium and public.boost_next_free_at(rec.id, v_now) is not null;

      if v_live then
        -- Not in the app right now / no fresh match or message (same hold as the daily pushes).
        select h.hold_reason into v_hold from public.marketing_push_hold(rec.id, false, false, true) h;
        continue when v_hold is not null;
        -- No push of any kind in the last 45 minutes.
        continue when exists (
          select 1 from public.push_delivery_log l
          where l.user_id = rec.id and l.decision <> 'suppressed'
            and l.created_at > now() - make_interval(mins => (s->>'nudge_recent_push_minutes')::int));
      end if;

      v_variant := mod(abs(hashtext(rec.id::text || ':' || v_day::text || ':copy')), 4);
      select c.title, c.body into v_title, v_body
      from public.boost_nudge_copy(v_variant,
             case when v_premium then (s->>'premium_minutes')::int else (s->>'free_minutes')::int end) c;
      v_key := 'boost_nudge:' || v_day;

      insert into public.boost_nudge_log (user_id, local_day, sent_at, variant, dedupe_key)
      values (rec.id, v_day, v_now, v_variant, v_key)
      on conflict (user_id, local_day) do nothing;
      continue when not found;

      perform public.boost_push(rec.id, v_title, v_body, 'recommendation', 'boost_nudge', v_key,
                                jsonb_build_object('action', 'open_boost'));
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'send_boost_nudges: skipping user % after error: %', rec.id, sqlerrm;
    end;
  end loop;

  delete from public.boost_nudge_log where sent_at < v_now - interval '90 days';
  return v_sent;
end;
$function$;
revoke all on function public.send_boost_nudges(timestamptz, uuid[]) from public, anon, authenticated;

-- 9. Schedules ---------------------------------------------------------------------------------------------------------

select cron.schedule('send-boost-end-pushes', '*/5 * * * *', 'select public.send_boost_end_pushes();');
select cron.schedule('send-boost-nudges-hourly', '50 * * * *', 'select public.send_boost_nudges();');
