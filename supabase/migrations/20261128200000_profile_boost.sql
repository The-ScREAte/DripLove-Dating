-- Boost: a member puts themselves at the front of other people's Discover deck for a short time.
--
-- README
--  * Free members: one 15-minute boost per rolling 24 hours. Premium members: a 20-minute boost they can start
--    again as soon as the last one has ended (never two at once). All numbers live in public.boost_settings().
--  * Who sees a boosted member: only viewers whose Discover deck would show them anyway (same rules as
--    DiscoverPage.tsx - country / unlocked countries, distance, the viewer's age range, gender preference both
--    ways, active account) and who haven't already liked, passed (30 days), matched, blocked, been blocked by,
--    are on a match cooldown with, have in a Circle row, or have a waiting / declined icebreaker with them.
--    The app asks get_boosted_profiles_for_me() and slots those cards in just behind the card on screen.
--  * get_random_discover_profiles also puts members with a live Boost first (ahead of the admin / weekly
--    feed_boosts, inside the same half-batch cap), so they are always in the batch the deck is built from.
--  * "Boost got you this": get_boost_wins() lists likes and first messages that arrived while the member's own
--    boost was running, matched by time - nothing changes in likes or chats.
--  * No new push. Existing like / message pushes are unchanged.
--  * The existing feed_boosts system (admin boosts, boost-unseen-profiles-weekly, trim-feed-boosts-daily) is
--    untouched apart from sharing the boosted slot in get_random_discover_profiles.

-- 1. Settings (the one place to change durations / free allowance) ---------------------------------------------

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
    'free_window_hours', 24
  );
$function$;
revoke all on function public.boost_settings() from public, anon;
grant execute on function public.boost_settings() to authenticated;

-- 2. Table ------------------------------------------------------------------------------------------------------

create table if not exists public.profile_boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('free', 'premium')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint profile_boosts_ends_after_start check (ends_at > started_at)
);

create index if not exists idx_profile_boosts_user_started on public.profile_boosts (user_id, started_at desc);
create index if not exists idx_profile_boosts_ends_at on public.profile_boosts (ends_at);

alter table public.profile_boosts enable row level security;

drop policy if exists "Users can view their own boosts" on public.profile_boosts;
create policy "Users can view their own boosts" on public.profile_boosts
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.profile_boosts from public, anon, authenticated;
grant select on table public.profile_boosts to authenticated;

-- 3. Helpers (internal) --------------------------------------------------------------------------------------------

-- When the member's next free boost becomes available (null = available now).
create or replace function public.boost_next_free_at(p_user uuid)
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
    where b.user_id = p_user and b.kind = 'free' and b.started_at > now() - s.win
    order by b.started_at desc
  )
  select case
           when (select count(*) from recent) >= (select per_window from s)
           then (select r.started_at from recent r order by r.started_at desc
                 offset (select per_window - 1 from s) limit 1) + (select win from s)
         end;
$function$;
revoke all on function public.boost_next_free_at(uuid) from public, anon, authenticated;

-- 4. activate_boost() ----------------------------------------------------------------------------------------------

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

  insert into public.profile_boosts (user_id, kind, started_at, ends_at)
  values (v_uid, v_kind, now(), now() + make_interval(mins => v_minutes))
  returning * into v_row;

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

-- 5. get_my_boost() ------------------------------------------------------------------------------------------------

create or replace function public.get_my_boost()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_settings jsonb := public.boost_settings();
  v_active public.profile_boosts;
  v_premium boolean;
  v_next timestamptz;
  v_is_active boolean;
begin
  if v_uid is null then
    return jsonb_build_object('active', false, 'can_activate', false, 'error', 'not_authenticated');
  end if;

  select * into v_active from public.profile_boosts b
  where b.user_id = v_uid and b.started_at <= now() and b.ends_at > now()
  order by b.ends_at desc limit 1;
  v_is_active := found;

  v_premium := public.user_is_premium_now(v_uid);
  v_next := case when v_premium then null else public.boost_next_free_at(v_uid) end;

  return jsonb_build_object(
    'active', v_is_active,
    'boost_id', case when v_is_active then v_active.id end,
    'kind', case when v_is_active then v_active.kind end,
    'started_at', case when v_is_active then v_active.started_at end,
    'ends_at', case when v_is_active then v_active.ends_at end,
    'is_premium', v_premium,
    -- Length of the running boost, or of the one the member would start next.
    'duration_minutes', case
      when v_is_active then round(extract(epoch from (v_active.ends_at - v_active.started_at)) / 60)::int
      when v_premium then (v_settings->>'premium_minutes')::int
      else (v_settings->>'free_minutes')::int end,
    'can_activate', (not v_is_active) and (v_premium or v_next is null),
    'next_free_at', v_next,
    'free_boosts_per_window', (v_settings->>'free_boosts_per_window')::int,
    'free_window_hours', (v_settings->>'free_window_hours')::int,
    'server_now', now()
  );
end;
$function$;
revoke all on function public.get_my_boost() from public, anon;
grant execute on function public.get_my_boost() to authenticated;

-- 6. get_boosted_profiles_for_me() -------------------------------------------------------------------------------
-- Mirrors DiscoverPage.tsx fetchPotentialMatchesData: country (free = home only, premium = home + unlocked),
-- distance (home country only: max_distance ?? distance_preference ?? 50, capped at 5000 km; missing coordinates
-- on either side pass), the viewer's age range (free: date of birth required; premium: missing passes), gender
-- preference both ways (getGenderFilter + matchesReciprocalPreference), and the deck's exclusion list.

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
  v_countries := array_remove(array[v_base], null);
  if v_premium then
    v_countries := v_countries || coalesce(
      (select array_agg(distinct upper(trim(c))) from unnest(v_me.unlocked_countries) c where nullif(trim(c), '') is not null),
      '{}'::text[]);
  end if;
  if coalesce(cardinality(v_countries), 0) = 0 then
    return;
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
    select distinct on (b.user_id) b.user_id, b.ends_at
    from public.profile_boosts b
    where b.ends_at > now() and b.started_at <= now() and b.user_id <> v_uid
    order by b.user_id, b.ends_at desc
  )
  select l.user_id, l.ends_at
  from live l
  join public.profiles p on p.id = l.user_id
  where p.account_status = 'active'
    and p.is_admin = false
    and upper(p.country_code) = any(v_countries)
    and p.gender = any(v_genders)
    -- the candidate wants the viewer back
    and (lower(trim(coalesce(p.preference, ''))) in ('', 'everyone', 'both')
         or v_my_gender = '' or lower(trim(p.preference)) = v_my_gender)
    -- distance: home country only
    and (
      upper(p.country_code) is distinct from v_base
      or v_me.latitude is null or v_me.longitude is null or p.latitude is null or p.longitude is null
      or public.calculate_distance(v_me.latitude, v_me.longitude, p.latitude, p.longitude) <= v_max_km
    )
    -- the viewer's age range
    and (
      case when p.date_of_birth is null then v_premium
           else extract(year from age(current_date, p.date_of_birth))::int between v_min_age and v_max_age end
    )
    -- the deck's exclusions
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

-- 7. get_boost_wins() ----------------------------------------------------------------------------------------------
-- Likes and first messages (the sender's first message in that match) received while one of the caller's own
-- boosts was running. match_id is set for messages so the chat list can label the conversation.

create or replace function public.get_boost_wins(p_since timestamptz default (now() - interval '1 day'))
returns table(kind text, from_user uuid, created_at timestamptz, boost_id uuid, match_id uuid)
language sql
stable
security definer
set search_path to ''
as $function$
  with my_boosts as (
    select b.id, b.started_at, least(b.ends_at, now()) as until
    from public.profile_boosts b
    where b.user_id = auth.uid()
      and b.ends_at > coalesce(p_since, now() - interval '1 day')
      and b.started_at <= now()
  ), wins as (
    select 'like'::text as kind, l.liker_id as from_user, l.created_at, mb.id as boost_id, null::uuid as match_id
    from my_boosts mb
    join public.likes l on l.liked_id = auth.uid()
                       and l.created_at >= mb.started_at and l.created_at <= mb.until
    union all
    select 'message'::text, c.sender_id, c.created_at, mb.id, c.match_id
    from my_boosts mb
    join public.chats c on c.recipient_id = auth.uid()
                       and c.created_at >= mb.started_at and c.created_at <= mb.until
    where c.sender_id <> auth.uid()
      and not exists (select 1 from public.chats c2
                      where c2.match_id = c.match_id and c2.sender_id = c.sender_id
                        and (c2.created_at < c.created_at or (c2.created_at = c.created_at and c2.id < c.id)))
  )
  select w.kind, w.from_user, w.created_at, w.boost_id, w.match_id
  from wins w
  where w.created_at >= coalesce(p_since, now() - interval '1 day')
    and not exists (select 1 from public.blocks bl
                    where (bl.blocker_id = auth.uid() and bl.blocked_id = w.from_user)
                       or (bl.blocker_id = w.from_user and bl.blocked_id = auth.uid()))
  order by w.created_at desc
  limit 500;
$function$;
revoke all on function public.get_boost_wins(timestamptz) from public, anon;
grant execute on function public.get_boost_wins(timestamptz) to authenticated;

-- 8. get_random_discover_profiles: live Boosts first ----------------------------------------------------------------
-- Same signature, filters and half-batch cap as 20261011220000. The boosted slot is filled with members on a live
-- Boost first (few rows, probed by idx_profile_boosts_ends_at), then the admin / weekly feed_boosts.

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
  with live_boosted as materialized (
    select p as prof, p.id, p.feed_random_weight as weight
    from public.profiles p
    where p.id in (select pb.user_id from public.profile_boosts pb
                   where pb.ends_at > now() and pb.started_at <= now())
      and p.country_code = any(p_country_codes)
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
