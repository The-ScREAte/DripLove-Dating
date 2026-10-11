-- Admin: real login counts, "times active", a debug filter for the Users list,
-- and feed boosts so people nobody has seen yet get seen.
--
--  * Logins: profiles.login_count counts actual sign-ins again (it stopped -
--    update_last_login wasn't attached to anything). A trigger on
--    auth.users.last_sign_in_at adds one per sign-in, including signing in
--    again after logging out.
--  * Times active: profiles.active_session_count goes up each time someone
--    comes back after 30+ minutes away. The app refreshes last_login_at every
--    few minutes while it's in use (every app version), so a gap of 30
--    minutes or more means a new visit. Starts from the login count.
--  * admin_search_users_page: photos (with/without), profile completion
--    (same weights as src/utils/profileCompletion.ts), seen (never / not in
--    30 days / seen - "seen" = someone liked or passed them), boosted; sort
--    options; returns the new numbers.
--  * Feed boosts: a boosted profile comes first in get_random_discover_profiles
--    for every viewer whose own filters already include them - country,
--    gender, distance, exclusions all still apply. Admins boost from the Users
--    list; boost_unseen_profiles (weekly) boosts everyone with photos that
--    nobody has liked or passed in 30 days, for a week. At most half of any
--    batch is boosted, and a boost ends early after 20 likes/passes.

-- 1. Times active -------------------------------------------------------------

alter table public.profiles add column if not exists active_session_count integer not null default 0;

update public.profiles
   set active_session_count = greatest(coalesce(login_count, 0), case when last_login_at is not null then 1 else 0 end)
 where active_session_count = 0;

create or replace function public.count_active_session()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.last_login_at is not null
     and (old.last_login_at is null or new.last_login_at > old.last_login_at + interval '30 minutes') then
    new.active_session_count := coalesce(old.active_session_count, 0) + 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_count_active_session on public.profiles;
create trigger profiles_count_active_session
  before update of last_login_at on public.profiles
  for each row execute function public.count_active_session();

-- 2. Logins: one per sign-in -----------------------------------------------------

-- Never blocks a sign-in: anything that goes wrong here is skipped.
create or replace function public.record_sign_in()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    update public.profiles
       set last_login_at = now(),
           login_count = coalesce(login_count, 0) + 1
     where id = new.id;
  exception when others then
    null;
  end;
  return new;
end;
$function$;
revoke all on function public.record_sign_in() from public, anon, authenticated;

do $do$
begin
  drop trigger if exists on_auth_user_signed_in on auth.users;
  create trigger on_auth_user_signed_in
    after update of last_sign_in_at on auth.users
    for each row
    when (new.last_sign_in_at is distinct from old.last_sign_in_at)
    execute function public.record_sign_in();
exception when insufficient_privilege then
  raise notice 'Could not attach the sign-in trigger to auth.users: %', sqlerrm;
end;
$do$;

-- 3. Profile completion (same weights as src/utils/profileCompletion.ts) ---------

create or replace function public.profile_completion_percent(p public.profiles, p_photo_count integer)
returns integer
language sql
stable
set search_path to ''
as $function$
  select
      (case when coalesce(p_photo_count, 0) >= 3 then 15 else 0 end)
    + (case when nullif(trim(p.first_name), '') is not null and nullif(trim(p.last_name), '') is not null
             and nullif(trim(p.bio), '') is not null and p.date_of_birth is not null then 15 else 0 end)
    + (case when nullif(trim(p.city), '') is not null and nullif(trim(p.country), '') is not null
             and coalesce(nullif(p.max_distance, 0), nullif(p.distance_preference, 0)) is not null then 10 else 0 end)
    + (case when nullif(p.gender, '') is not null and nullif(p.preference, '') is not null then 10 else 0 end)
    + (case when nullif(p.smoking, '') is not null and nullif(p.drinking, '') is not null
             and nullif(p.exercise_level, '') is not null and nullif(p.sleeping_schedule, '') is not null then 10 else 0 end)
    + (case when nullif(trim(p.occupation), '') is not null and nullif(p.education_level, '') is not null then 10 else 0 end)
    + (case when p.introvert_extrovert is not null and p.spontaneous_planner is not null
             and p.messy_organized is not null then 10 else 0 end)
    + (case when nullif(trim(p.fun_fact), '') is not null or nullif(trim(p.perfect_first_date), '') is not null
             or nullif(trim(p.last_googled), '') is not null then 10 else 0 end)
    + (case when coalesce(cardinality(p.interests), 0) >= 3 then 10 else 0 end);
$function$;
revoke all on function public.profile_completion_percent(public.profiles, integer) from public, anon, authenticated;

-- "Seen" lookups (who received a pass).
create index if not exists idx_passes_passed_id on public.passes (passed_id, passed_at desc);

-- 4. Feed boosts ---------------------------------------------------------------------

create table if not exists public.feed_boosts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  boost_until timestamptz not null,
  reason text not null default 'admin',
  boosted_by uuid,
  created_at timestamptz not null default now()
);
alter table public.feed_boosts enable row level security;

-- Boosted profiles first, within exactly the same filters as before. At most
-- half of each batch is boosted, so a deck is never all boosted profiles.
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
  select (s.prof).*
  from (
    select p as prof,
           p.feed_random_weight as weight,
           (b.user_id is not null) as boosted,
           row_number() over (partition by (b.user_id is not null) order by p.feed_random_weight) as boost_rank
    from public.profiles p
    left join public.feed_boosts b on b.user_id = p.id and b.boost_until > now()
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
  ) s
  order by (s.boosted and s.boost_rank <= greatest(1, p_limit / 2)) desc, s.weight
  limit p_limit;
$function$;

-- Weekly: boost everyone with photos that nobody has liked or passed in 30
-- days. Archived profiles only ever appear in the archived top-up, so boosting
-- them reorders that top-up and never pushes active members out.
create or replace function public.boost_unseen_profiles(p_days integer default 7)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  insert into public.feed_boosts (user_id, boost_until, reason)
  select p.id, now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), 'unseen_weekly'
  from public.profiles p
  where coalesce(p.account_status, 'active') = 'active'
    and coalesce(p.is_admin, false) = false
    and p.created_at < now() - interval '2 days'
    and exists (select 1 from public.user_images ui
                where ui.user_id = p.id and ui.is_approved = true and ui.image_order <> -1)
    and not exists (select 1 from public.likes l where l.liked_id = p.id and l.created_at > now() - interval '30 days')
    and not exists (select 1 from public.passes ps where ps.passed_id = p.id and ps.passed_at > now() - interval '30 days')
  on conflict (user_id) do update
    set boost_until = greatest(public.feed_boosts.boost_until, excluded.boost_until),
        reason = excluded.reason,
        created_at = case when public.feed_boosts.boost_until < now() then now()
                          else public.feed_boosts.created_at end;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.boost_unseen_profiles(integer) from public, anon, authenticated;

-- Daily: a boost ends once the profile has been liked or passed 20 times since
-- it started - they've been seen, so the slot goes to someone else.
create or replace function public.trim_feed_boosts()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  delete from public.feed_boosts b
  where b.boost_until < now()
     or (
       (select count(*) from public.likes l where l.liked_id = b.user_id and l.created_at >= b.created_at)
       + (select count(*) from public.passes ps where ps.passed_id = b.user_id and ps.passed_at >= b.created_at)
     ) >= 20;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.trim_feed_boosts() from public, anon, authenticated;

create or replace function public.admin_boost_profiles(p_user_ids uuid[], p_days integer default 7)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  insert into public.feed_boosts (user_id, boost_until, reason, boosted_by)
  select distinct t.uid, now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))), 'admin', auth.uid()
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) as t(uid)
  where exists (select 1 from public.profiles p where p.id = t.uid)
  on conflict (user_id) do update
    set boost_until = excluded.boost_until, reason = excluded.reason,
        boosted_by = excluded.boosted_by, created_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.admin_boost_profiles(uuid[], integer) from public, anon;
grant execute on function public.admin_boost_profiles(uuid[], integer) to authenticated;

create or replace function public.admin_clear_boosts(p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  delete from public.feed_boosts where user_id = any(coalesce(p_user_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.admin_clear_boosts(uuid[]) from public, anon;
grant execute on function public.admin_clear_boosts(uuid[]) to authenticated;

create or replace function public.admin_boost_unseen_now()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  return public.boost_unseen_profiles(7);
end;
$function$;
revoke all on function public.admin_boost_unseen_now() from public, anon;
grant execute on function public.admin_boost_unseen_now() to authenticated;

-- 5. One member's activity, for the admin profile view --------------------------------

create or replace function public.admin_user_activity(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result json;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  select json_build_object(
    'signed_up', p.created_at,
    'last_active', p.last_login_at,
    'last_sign_in', u.last_sign_in_at,
    'logins', coalesce(p.login_count, 0),
    'times_active', coalesce(p.active_session_count, 0),
    'photo_count', ph.photos,
    'profile_completion', public.profile_completion_percent(p, ph.photos),
    'likes_received', (select count(*) from public.likes l where l.liked_id = p.id),
    'passes_received', (select count(*) from public.passes ps where ps.passed_id = p.id),
    'likes_given', (select count(*) from public.likes l where l.liker_id = p.id),
    'matches', (select count(*) from public.matches m where m.user1_id = p.id or m.user2_id = p.id),
    'boost_until', (select b.boost_until from public.feed_boosts b where b.user_id = p.id and b.boost_until > now()),
    'devices', (select coalesce(json_agg(t.platform), '[]'::json) from public.push_tokens t where t.user_id = p.id)
  ) into v_result
  from public.profiles p
  left join auth.users u on u.id = p.id
  cross join lateral (select count(*)::integer as photos from public.user_images ui
                      where ui.user_id = p.id and ui.is_approved is distinct from false
                        and coalesce(ui.image_order, 0) <> -1) ph
  where p.id = p_user_id;
  return v_result;
end;
$function$;
revoke all on function public.admin_user_activity(uuid) from public, anon;
grant execute on function public.admin_user_activity(uuid) to authenticated;

-- 6. Users list: debug filters, sort, new numbers -----------------------------------------

drop function if exists public.admin_search_users_page(text, text, text, text, text, text, text, text, text, integer, integer);
create or replace function public.admin_search_users_page(
  p_search text default null::text, p_status text default 'all'::text, p_gender text default 'all'::text,
  p_preference text default 'all'::text, p_country text default 'all'::text,
  p_relationship_intent text default 'all'::text, p_premium text default 'all'::text,
  p_activity text default 'all'::text, p_archive text default 'all'::text,
  p_limit integer default 20, p_offset integer default 0,
  p_photos text default 'all'::text, p_completion text default 'all'::text,
  p_seen text default 'all'::text, p_boost text default 'all'::text, p_sort text default 'newest'::text
)
returns table(
  id uuid, first_name text, last_name text, email text, account_status text, created_at timestamp with time zone,
  city text, country text, date_of_birth date, is_admin boolean, gender text, preference text,
  relationship_intent text, last_login_at timestamp with time zone, login_count integer, is_archived boolean,
  is_premium boolean, total_count bigint,
  active_session_count integer, photo_count integer, profile_completion integer,
  likes_received bigint, passes_received bigint, boost_until timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Table-qualified throughout: RETURNS TABLE(id uuid, ...) creates OUT
  -- parameters that would shadow unqualified column names.
  if not exists (
    select 1 from public.profiles admin_check
    where admin_check.id = auth.uid() and admin_check.is_admin = true
  ) then
    raise exception 'Unauthorized: Admin access required';
  end if;

  return query
  with filtered as (
    select p.id as pid, p.created_at as p_created, p.last_login_at as p_last,
           coalesce(p.login_count, 0) as p_logins, coalesce(p.active_session_count, 0) as p_sessions,
           ph.photos, pc.completion,
           count(*) over () as total
    from public.profiles p
    cross join lateral (
      select count(*)::integer as photos from public.user_images ui
      where ui.user_id = p.id and ui.is_approved is distinct from false and coalesce(ui.image_order, 0) <> -1
    ) ph
    cross join lateral (select public.profile_completion_percent(p, ph.photos) as completion) pc
    where p.is_admin = false
      and (p_search is null or p_search = '' or (
        p.first_name ilike '%' || p_search || '%'
        or p.last_name ilike '%' || p_search || '%'
        or p.email ilike '%' || p_search || '%'
        or p.city ilike '%' || p_search || '%'
        or p.country ilike '%' || p_search || '%'
        or p.id::text ilike '%' || p_search || '%'
      ))
      and (p_status = 'all' or p.account_status = p_status)
      and (p_gender = 'all' or p.gender = p_gender)
      and (p_preference = 'all' or p.preference = p_preference)
      and (p_country = 'all' or p.country = p_country)
      and (p_relationship_intent = 'all' or p.relationship_intent = p_relationship_intent)
      and (p_archive = 'all' or (p_archive = 'archived' and p.is_archived = true)
           or (p_archive = 'active' and coalesce(p.is_archived, false) = false))
      and (
        p_activity = 'all' or (
          case p_activity
            when 'today' then coalesce(p.last_login_at, p.created_at) >= date_trunc('day', now())
            when '3_days' then coalesce(p.last_login_at, p.created_at) >= now() - interval '3 days'
            when '1_week' then coalesce(p.last_login_at, p.created_at) >= now() - interval '7 days'
            when '2_weeks' then coalesce(p.last_login_at, p.created_at) >= now() - interval '14 days'
            when '1_month' then coalesce(p.last_login_at, p.created_at) >= now() - interval '30 days'
            when '3_months' then coalesce(p.last_login_at, p.created_at) >= now() - interval '90 days'
            when 'inactive_month' then coalesce(p.last_login_at, p.created_at) < now() - interval '30 days'
            else true
          end
        )
      )
      and (
        p_premium = 'all' or (
          (p_premium = 'premium') = exists (
            select 1 from public.user_subscriptions us
            where us.user_id = p.id and us.plan_name = 'premium' and us.status = 'active'
          )
        )
      )
      and (p_photos = 'all' or (p_photos = 'with' and ph.photos > 0) or (p_photos = 'without' and ph.photos = 0))
      and (p_completion = 'all'
           or (p_completion = '0_25' and pc.completion < 25)
           or (p_completion = '25_50' and pc.completion >= 25 and pc.completion < 50)
           or (p_completion = '50_75' and pc.completion >= 50 and pc.completion < 75)
           or (p_completion = '75_100' and pc.completion >= 75)
           or (p_completion = 'incomplete' and pc.completion < 100))
      and (p_seen = 'all'
           or (p_seen = 'never'
               and not exists (select 1 from public.likes l where l.liked_id = p.id)
               and not exists (select 1 from public.passes ps where ps.passed_id = p.id))
           or (p_seen = 'not_30_days'
               and not exists (select 1 from public.likes l where l.liked_id = p.id and l.created_at > now() - interval '30 days')
               and not exists (select 1 from public.passes ps where ps.passed_id = p.id and ps.passed_at > now() - interval '30 days'))
           or (p_seen = 'seen'
               and (exists (select 1 from public.likes l where l.liked_id = p.id)
                    or exists (select 1 from public.passes ps where ps.passed_id = p.id))))
      and (p_boost = 'all'
           or (p_boost = 'boosted') = exists (
             select 1 from public.feed_boosts b where b.user_id = p.id and b.boost_until > now()))
  ),
  page as (
    select f.*,
           row_number() over (
             order by
               case when p_sort = 'oldest' then f.p_created end asc,
               case when p_sort = 'last_active' then coalesce(f.p_last, f.p_created) end desc nulls last,
               case when p_sort = 'most_logins' then f.p_logins end desc,
               case when p_sort = 'most_active' then f.p_sessions end desc,
               case when p_sort = 'least_complete' then f.completion end asc,
               case when p_sort = 'most_complete' then f.completion end desc,
               f.p_created desc
           ) as rn
    from filtered f
  )
  select p.id, p.first_name, p.last_name, p.email, p.account_status, p.created_at,
         p.city::text, p.country, p.date_of_birth, p.is_admin, p.gender, p.preference,
         p.relationship_intent, p.last_login_at, p.login_count, p.is_archived,
         exists (
           select 1 from public.user_subscriptions us
           where us.user_id = p.id and us.plan_name = 'premium' and us.status = 'active'
         ) as is_premium,
         pg.total,
         pg.p_sessions, pg.photos, pg.completion,
         (select count(*) from public.likes l where l.liked_id = p.id),
         (select count(*) from public.passes ps where ps.passed_id = p.id),
         (select b.boost_until from public.feed_boosts b where b.user_id = p.id and b.boost_until > now())
  from page pg
  join public.profiles p on p.id = pg.pid
  where pg.rn > p_offset and pg.rn <= p_offset + p_limit
  order by pg.rn;
end;
$function$;
revoke all on function public.admin_search_users_page(text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, text, text) from public, anon;
grant execute on function public.admin_search_users_page(text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, text, text) to authenticated;

-- 7. Jobs: weekly boost (Mondays 09:00 UTC), daily trim (04:20 UTC) --------------------------

select cron.schedule('boost-unseen-profiles-weekly', '0 9 * * 1', $$select public.boost_unseen_profiles();$$);
select cron.schedule('trim-feed-boosts-daily', '20 4 * * *', $$select public.trim_feed_boosts();$$);
