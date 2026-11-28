-- Daily 5 picks.
--
-- Every member gets a set of 5 recommended people each local day:
--   * 4 inside their range: their gender preference both ways, their age
--     range, their distance (home country) or unlocked countries (premium),
--     active accounts with an approved photo, nobody they already liked,
--     passed (30 days), matched, blocked (either way), are on a cooldown with,
--     or have a hello waiting with.
--   * 1 just outside it: everything above still holds except ONE of age
--     (at most 3 years outside) or distance (at most 50% / 25 km past their
--     limit), the closest match by the same scoring as the in-range four.
-- Scoring ports src/utils/matchScoring.ts (interests, personality sliders,
-- music artists, distance decay) plus relationship intent and languages, then
-- prefers recently-active people, people whose own age range fits the viewer,
-- people not already picked in the last 6 days, and a small per-day shuffle.
--
-- The set is stored in recommendation_picks (one row per user per local day,
-- readable only by its owner) and built lazily: by the midday push, or by the
-- app through get_my_daily_picks().
--
-- PUSH VOLUME IS UNCHANGED: the same two daily recommendation pushes as before
-- (send-recommendation-notifications-midday / -evening crons, same windows,
-- same holds, quiet hours and dedupe keys). Only who they feature and their
-- copy change:
--   midday  ('recommended'): announces today's picks, features the top in-range one
--   evening ('similar')    : features the just-outside-your-range one
--                            ("Not sure they're your type? Chat anyway"), or,
--                            if they've already decided on it, an undecided pick.
-- Both open that person's profile in Circle (action open_circle_profile), which
-- current app versions already support; the out-of-range person still passes
-- the app's notification eligibility check (country, gender both ways and
-- exclusions - it skips age/distance for notification taps).

-- 1. Storage ------------------------------------------------------------------

create table if not exists public.recommendation_picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  pick_date date not null,
  profile_ids uuid[] not null default '{}',      -- display order: in-range first, out-of-range last
  in_range_ids uuid[] not null default '{}',
  out_of_range_id uuid,
  out_of_range_reason text check (out_of_range_reason in ('age', 'distance')),
  details jsonb not null default '[]'::jsonb,   -- per pick: slot, score, age, distance_km, shared_trait
  midday_profile_id uuid,
  evening_profile_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, pick_date)
);

alter table public.recommendation_picks enable row level security;

drop policy if exists "Users can view their own daily picks" on public.recommendation_picks;
create policy "Users can view their own daily picks"
  on public.recommendation_picks
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.recommendation_picks from anon, authenticated;
grant select on public.recommendation_picks to authenticated;

-- 2. Who can never be recommended to this user right now ----------------------

create or replace function public.recommendation_excluded_ids(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(array_agg(distinct x) filter (where x is not null), '{}'::uuid[])
  from (
    select p_user_id as x
    union all select l.liked_id from public.likes l where l.liker_id = p_user_id
    union all select ps.passed_id from public.passes ps
      where ps.passer_id = p_user_id and ps.passed_at >= now() - interval '30 days'
    union all select case when m.user1_id = p_user_id then m.user2_id else m.user1_id end
      from public.matches m where m.user1_id = p_user_id or m.user2_id = p_user_id
    union all select b.blocked_id from public.blocks b where b.blocker_id = p_user_id
    union all select b.blocker_id from public.blocks b where b.blocked_id = p_user_id
    union all select case when c.user1_id = p_user_id then c.user2_id else c.user1_id end
      from public.match_cooldowns c
      where (c.user1_id = p_user_id or c.user2_id = p_user_id) and c.expires_at > now()
    union all select case when i.sender_id = p_user_id then i.recipient_id else i.sender_id end
      from public.icebreakers i
      where (i.sender_id = p_user_id or i.recipient_id = p_user_id) and i.status = 'pending'
  ) s;
$function$;

-- 3. Compatibility score (0-1), a port of src/utils/matchScoring.ts -------------

create or replace function public.recommendation_music_artists(p_favorites jsonb)
returns text[]
language sql
immutable
set search_path to ''
as $function$
  select coalesce(array_agg(distinct a) filter (where a <> ''), '{}'::text[])
  from (
    select lower(trim(t.v)) as a
    from jsonb_array_elements(case when jsonb_typeof(p_favorites) = 'array' then p_favorites else '[]'::jsonb end) e
    cross join lateral (
      select jsonb_array_elements_text(case when jsonb_typeof(e->'topArtists') = 'array' then e->'topArtists' else '[]'::jsonb end) as v
      union all
      select e->>'detail' where jsonb_typeof(e->'detail') = 'string'
    ) t
    where e->>'category' = 'Music'
  ) s;
$function$;

create or replace function public.recommendation_compat_score(
  p_v_interests text[], p_v_languages text[], p_v_intent text, p_v_favorites jsonb,
  p_v_ie integer, p_v_sp integer, p_v_mo integer,
  p_c_interests text[], p_c_languages text[], p_c_intent text, p_c_favorites jsonb,
  p_c_ie integer, p_c_sp integer, p_c_mo integer,
  p_distance_km numeric
)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_sum numeric := 0;
  v_w numeric := 0;
  v_a text[];
  v_b text[];
  v_shared integer;
  v_den integer;
begin
  -- Interests (0.4): shared / larger set, case-insensitive. Only when both set.
  select coalesce(array_agg(distinct lower(trim(x))), '{}') into v_a from unnest(coalesce(p_v_interests, '{}')) x where trim(x) <> '';
  select coalesce(array_agg(distinct lower(trim(x))), '{}') into v_b from unnest(coalesce(p_c_interests, '{}')) x where trim(x) <> '';
  if cardinality(v_a) > 0 and cardinality(v_b) > 0 then
    select count(*) into v_shared from unnest(v_a) x where x = any(v_b);
    v_den := greatest(cardinality(v_a), cardinality(v_b));
    v_sum := v_sum + 0.4 * v_shared::numeric / v_den;
    v_w := v_w + 0.4;
  end if;

  -- Music artists (0.15).
  v_a := public.recommendation_music_artists(p_v_favorites);
  v_b := public.recommendation_music_artists(p_c_favorites);
  if cardinality(v_a) > 0 and cardinality(v_b) > 0 then
    select count(*) into v_shared from unnest(v_a) x where x = any(v_b);
    v_sum := v_sum + 0.15 * v_shared::numeric / greatest(cardinality(v_a), cardinality(v_b));
    v_w := v_w + 0.15;
  end if;

  -- Personality sliders (0.3): only when both moved any slider off the default 50.
  if (coalesce(p_v_ie, 50) <> 50 or coalesce(p_v_sp, 50) <> 50 or coalesce(p_v_mo, 50) <> 50)
     and (coalesce(p_c_ie, 50) <> 50 or coalesce(p_c_sp, 50) <> 50 or coalesce(p_c_mo, 50) <> 50) then
    v_sum := v_sum + 0.3 * (1 - (abs(coalesce(p_v_ie, 50) - coalesce(p_c_ie, 50))
                               + abs(coalesce(p_v_sp, 50) - coalesce(p_c_sp, 50))
                               + abs(coalesce(p_v_mo, 50) - coalesce(p_c_mo, 50)))::numeric / 300);
    v_w := v_w + 0.3;
  end if;

  -- Relationship intent (0.2): same intent or not, when both set.
  if nullif(p_v_intent, '') is not null and nullif(p_c_intent, '') is not null then
    v_sum := v_sum + case when p_v_intent = p_c_intent then 0.2 else 0 end;
    v_w := v_w + 0.2;
  end if;

  -- Languages (0.1): any shared language, when both set.
  if cardinality(coalesce(p_v_languages, '{}')) > 0 and cardinality(coalesce(p_c_languages, '{}')) > 0 then
    v_sum := v_sum + case when p_v_languages && p_c_languages then 0.1 else 0 end;
    v_w := v_w + 0.1;
  end if;

  -- Distance decay (0.3), radius 25 km, whenever a distance is known.
  if p_distance_km is not null and p_distance_km >= 0 then
    v_sum := v_sum + 0.3 * exp(-least(p_distance_km, 2000) / 25.0);
    v_w := v_w + 0.3;
  end if;

  if v_w = 0 then
    return 0;
  end if;
  return round(v_sum / v_w, 4);
end;
$function$;

-- 4. The picker (read-only: returns the 5 without storing them) -----------------

create or replace function public.compute_recommendation_picks(p_user_id uuid, p_day date default null)
returns table(
  profile_id uuid,
  slot integer,
  is_out_of_range boolean,
  out_of_range_reason text,
  score numeric,
  age integer,
  distance_km numeric,
  shared_trait text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_self public.profiles;
  v_day date;
  v_is_premium boolean;
  v_countries text[];
  v_home text;
  v_max_km numeric;
  v_min_age integer;
  v_max_age integer;
  v_self_age integer;
  v_excluded uuid[];
  v_recent uuid[];
begin
  select * into v_self from public.profiles where id = p_user_id;
  if not found then
    return;
  end if;
  v_day := coalesce(p_day, (now() at time zone public.user_timezone(v_self.timezone, v_self.country_code))::date);

  select exists (
    select 1 from public.user_subscriptions s
    where s.user_id = p_user_id and s.plan_name = 'premium'
      and s.status in ('active', 'cancelled')
      and (s.expires_at is null or s.expires_at > now())
  ) into v_is_premium;

  v_home := upper(nullif(trim(coalesce(v_self.country_code, '')), ''));
  v_countries := array_remove(array[v_home], null);
  if v_is_premium and v_self.unlocked_countries is not null then
    v_countries := array(select distinct upper(c) from unnest(v_countries || v_self.unlocked_countries) c where c is not null and c <> '');
  end if;
  if cardinality(v_countries) = 0 then
    return;
  end if;

  v_max_km := least(greatest(coalesce(v_self.max_distance, v_self.distance_preference, 50), 1), 5000);
  v_min_age := greatest(coalesce(v_self.min_age, 18), 18);
  v_max_age := coalesce(v_self.max_age, 99);
  v_self_age := case when v_self.date_of_birth is not null then extract(year from age(v_self.date_of_birth))::int end;
  v_excluded := public.recommendation_excluded_ids(p_user_id);

  select coalesce(array_agg(distinct x), '{}') into v_recent
  from public.recommendation_picks rp, unnest(rp.profile_ids) x
  where rp.user_id = p_user_id and rp.pick_date >= v_day - 6 and rp.pick_date < v_day;

  return query
  with base as (
    select c.*,
           extract(year from age(c.date_of_birth))::int as c_age,
           case
             when upper(c.country_code) = v_home
              and v_self.latitude is not null and v_self.longitude is not null
              and c.latitude is not null and c.longitude is not null
             then round(public.calculate_distance(v_self.latitude, v_self.longitude, c.latitude, c.longitude), 1)
           end as c_dist
    from public.profiles c
    where c.id <> p_user_id
      and not (c.id = any(v_excluded))
      and c.account_status = 'active'
      and c.is_admin is not true
      -- Archived (away 30+ days) people are allowed, like Discover's archived
      -- mix-in, but rank far below anyone current - see the score below.
      and nullif(trim(coalesce(c.first_name, '')), '') is not null
      and c.date_of_birth is not null
      and upper(c.country_code) = any(v_countries)
      and (lower(coalesce(v_self.preference, 'everyone')) in ('everyone', 'both')
           or lower(c.gender) = lower(v_self.preference))
      and (lower(coalesce(c.preference, 'everyone')) in ('everyone', 'both')
           or v_self.gender is null
           or lower(c.preference) = lower(v_self.gender))
      and exists (
        select 1 from public.user_images ui
        where ui.user_id = c.id and ui.is_approved = true and ui.image_order <> -1
      )
  ), classified as (
    select b.*,
           (b.c_age between v_min_age and v_max_age) as age_ok,
           (b.c_dist is null or b.c_dist <= v_max_km) as dist_ok,
           case when b.c_age < v_min_age then v_min_age - b.c_age
                when b.c_age > v_max_age then b.c_age - v_max_age else 0 end as age_gap,
           case when b.c_dist is not null and b.c_dist > v_max_km then b.c_dist - v_max_km else 0 end as dist_over
    from base b
  ), scored as (
    select cl.*,
           public.recommendation_compat_score(
             v_self.interests, v_self.languages, v_self.relationship_intent, v_self.favorites,
             v_self.introvert_extrovert, v_self.spontaneous_planner, v_self.messy_organized,
             cl.interests, cl.languages, cl.relationship_intent, cl.favorites,
             cl.introvert_extrovert, cl.spontaneous_planner, cl.messy_organized,
             cl.c_dist)
           -- around right now beats a great match who left months ago
           + case when greatest(cl.last_app_open_at, cl.last_login_at) > now() - interval '14 days' then 0.15
                  when greatest(cl.last_app_open_at, cl.last_login_at) < now() - interval '60 days'
                       or greatest(cl.last_app_open_at, cl.last_login_at) is null then -0.2
                  else 0 end
           + case when cl.is_archived then -0.3 else 0 end
           -- the viewer fits THEIR age range too
           + case when v_self_age is null then 0
                  when v_self_age between coalesce(cl.min_age, 18) and coalesce(cl.max_age, 99) then 0.05
                  else -0.05 end
           -- not the same faces every day
           + case when cl.id = any(v_recent) then -0.35 else 0 end
           -- small stable per-day shuffle so equal scores rotate
           + (mod(abs(hashtext(p_user_id::text || v_day::text || cl.id::text)), 1000))::numeric / 1000 * 0.08
             as total
    from classified cl
    where (cl.age_ok and cl.dist_ok)
       or (not cl.age_ok and cl.dist_ok and cl.age_gap between 1 and 3)
       or (cl.age_ok and not cl.dist_ok and cl.dist_over <= greatest(25, v_max_km * 0.5))
  ), in_range as (
    select s.*, row_number() over (order by s.total desc, s.id) as rn
    from scored s where s.age_ok and s.dist_ok
  ), top_in as (
    select * from in_range where rn <= 4
  ), stretch as (
    select s.*,
           case when not s.age_ok then 'age' else 'distance' end as reason,
           s.total - s.age_gap * 0.04 - (s.dist_over / v_max_km) * 0.3 as stretch_total
    from scored s
    where not (s.age_ok and s.dist_ok)
    order by stretch_total desc, s.id
    limit 1
  ), backfill as (
    -- Nobody just outside their range: a 5th in-range person instead.
    select * from in_range where rn = 5 and not exists (select 1 from stretch)
  )
  select t.id, t.rn::int, false, null::text, round(t.total, 3), t.c_age, t.c_dist,
         public.pick_shared_trait(v_self.interests, v_self.languages, v_self.pets, v_self.relationship_intent,
                                  t.interests, t.languages, t.pets, t.relationship_intent)
  from top_in t
  union all
  select st.id, 5, true, st.reason, round(st.stretch_total, 3), st.c_age, st.c_dist,
         public.pick_shared_trait(v_self.interests, v_self.languages, v_self.pets, v_self.relationship_intent,
                                  st.interests, st.languages, st.pets, st.relationship_intent)
  from stretch st
  union all
  select bf.id, 5, false, null::text, round(bf.total, 3), bf.c_age, bf.c_dist,
         public.pick_shared_trait(v_self.interests, v_self.languages, v_self.pets, v_self.relationship_intent,
                                  bf.interests, bf.languages, bf.pets, bf.relationship_intent)
  from backfill bf
  order by 2;
end;
$function$;

-- 5. Today's stored set (builds it once per local day) --------------------------

create or replace function public.ensure_recommendation_picks(p_user_id uuid)
returns public.recommendation_picks
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_day date;
  v_row public.recommendation_picks;
begin
  select (now() at time zone public.user_timezone(p.timezone, p.country_code))::date into v_day
  from public.profiles p where p.id = p_user_id;
  if v_day is null then
    return null;
  end if;

  select * into v_row from public.recommendation_picks where user_id = p_user_id and pick_date = v_day;
  if found then
    return v_row;
  end if;

  insert into public.recommendation_picks (user_id, pick_date, profile_ids, in_range_ids, out_of_range_id, out_of_range_reason, details)
  select p_user_id, v_day,
         coalesce(array_agg(c.profile_id order by c.slot), '{}'),
         coalesce(array_agg(c.profile_id order by c.slot) filter (where not c.is_out_of_range), '{}'),
         (array_agg(c.profile_id) filter (where c.is_out_of_range))[1],
         (array_agg(c.out_of_range_reason) filter (where c.is_out_of_range))[1],
         coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', c.profile_id, 'slot', c.slot, 'out_of_range', c.is_out_of_range,
           'reason', c.out_of_range_reason, 'score', c.score, 'age', c.age,
           'distance_km', c.distance_km, 'shared_trait', c.shared_trait) order by c.slot), '[]'::jsonb)
  from public.compute_recommendation_picks(p_user_id, v_day) c
  on conflict (user_id, pick_date) do nothing;

  -- Keep a month of history (used to avoid repeating faces).
  delete from public.recommendation_picks where user_id = p_user_id and pick_date < v_day - 30;

  select * into v_row from public.recommendation_picks where user_id = p_user_id and pick_date = v_day;
  return v_row;
end;
$function$;

-- 6. What the app reads ----------------------------------------------------------

create or replace function public.get_my_daily_picks()
returns table(
  profile_id uuid,
  slot integer,
  is_out_of_range boolean,
  out_of_range_reason text,
  age integer,
  distance_km numeric,
  shared_trait text,
  is_decided boolean,   -- liked/passed/matched/blocked/etc since, or no longer an active account: hide it
  is_away boolean,      -- archived (not in the app for 30+ days)
  pick_date date
)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_row public.recommendation_picks;
  v_excluded uuid[];
begin
  if v_uid is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_row := public.ensure_recommendation_picks(v_uid);
  if v_row.user_id is null then
    return;
  end if;
  v_excluded := public.recommendation_excluded_ids(v_uid);
  return query
  select (d->>'profile_id')::uuid,
         (d->>'slot')::int,
         coalesce((d->>'out_of_range')::boolean, false),
         d->>'reason',
         (d->>'age')::int,
         (d->>'distance_km')::numeric,
         d->>'shared_trait',
         ((d->>'profile_id')::uuid = any(v_excluded) or coalesce(p.account_status, 'gone') <> 'active'),
         coalesce(p.is_archived, false),
         v_row.pick_date
  from jsonb_array_elements(v_row.details) d
  left join public.profiles p on p.id = (d->>'profile_id')::uuid
  order by (d->>'slot')::int;
end;
$function$;

-- 7. Push copy: short, inviting, never claims someone liked them -----------------
--  p_kind: 'daily' (midday, today's set) | 'stretch' (evening, just outside
--  their range) | 'reminder' (evening, an undecided in-range pick)
--  p_person: "Ama • 27 • Kumasi • Hiking" (build_profile_push_body)

create or replace function public.recommendation_push_copy(
  p_kind text, p_variant integer, p_viewer_name text, p_person text, p_count integer
)
returns table(title text, body text)
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_name text := nullif(trim(coalesce(p_viewer_name, '')), '');
  v_n integer := greatest(coalesce(p_count, 1), 1);
  v_v integer := mod(abs(coalesce(p_variant, 0)), 4);
begin
  if p_kind = 'daily' then
    if v_n = 1 then
      title := case v_v
        when 0 then coalesce(v_name || ', your', 'Your') || ' pick for today is in'
        when 1 then 'A new face picked for you today'
        when 2 then 'Today''s pick is here'
        else coalesce(v_name || ', someone', 'Someone') || ' worth a hello' end;
      body := p_person || '. Say hi before someone else does.';
    else
      title := case v_v
        when 0 then coalesce(v_name || ', your ', 'Your ') || v_n || ' picks are in'
        when 1 then v_n || ' new faces picked for you today'
        when 2 then 'Your daily picks are in'
        else coalesce(v_name || ', fresh', 'Fresh') || ' picks just for you' end;
      body := case v_v
        when 0 then 'Starting with ' || p_person || '. Say hi before someone else does.'
        when 1 then p_person || ' and ' || (v_n - 1) || ' more. Take a look'
        when 2 then p_person || '. Say hi before someone else does.'
        else p_person || ' • One hello is all it takes' end;
    end if;
  elsif p_kind = 'stretch' then
    title := case v_v
      when 0 then 'Not sure they''re your type? Chat anyway'
      when 1 then 'Someone a little outside your usual'
      when 2 then coalesce(v_name || ', break', 'Break') || ' the pattern tonight?'
      else 'Almost your type' end;
    body := case v_v
      when 0 then p_person || ' • Just outside your usual range'
      when 1 then p_person || '. Worth a hello?'
      when 2 then p_person || ' is just outside your filters. Chat anyway?'
      else p_person || '. A little outside your range, so why not say hi?' end;
  else
    title := case v_v
      when 0 then 'Your picks are still waiting'
      when 1 then 'Still deciding?'
      when 2 then coalesce(v_name || ', don''t', 'Don''t') || ' leave your picks hanging'
      else 'One hello could change your night' end;
    body := case v_v
      when 0 then p_person || '. Say hi before someone else does.'
      when 1 then p_person || ' is one of today''s picks.'
      when 2 then p_person || ' • Tap to say hello'
      else p_person || ' is one of your picks today.' end;
  end if;
  return next;
end;
$function$;

-- 8. The two daily recommendation pushes, now built from the picks --------------
-- Selection of WHO gets a push and WHEN is unchanged from
-- 20261010000000_mandatory_recommendations.sql (same windows, holds, 3h gap,
-- dedupe keys, category, kinds) - so the number of pushes is unchanged.

create or replace function public.send_recommendation_notifications(p_row_key text default 'recommended'::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rec record;
  v_picks public.recommendation_picks;
  v_excluded uuid[];
  v_open_in uuid[];
  v_stretch_ok boolean;
  v_candidate_id uuid;
  v_candidate record;
  v_kind text;
  v_count integer;
  v_trait text;
  v_age integer;
  v_title text;
  v_body text;
  v_data jsonb;
  v_name text;
  v_last_hour boolean;
  v_hold text;
  v_today date;
  v_first_hour integer;
  v_end_hour integer;
  v_min_gap interval := interval '3 hours';
begin
  if p_row_key not in ('recommended', 'similar') then
    raise exception 'send_recommendation_notifications: unsupported row key %', p_row_key;
  end if;
  v_first_hour := case p_row_key when 'recommended' then 11 else 18 end;
  v_end_hour := case p_row_key when 'recommended' then 14 else 20 end;

  for rec in
    select p.id, p.first_name, p.interests, p.languages, p.pets, p.relationship_intent,
           p.last_recommendation_sent_date, p.last_similar_sent_date, p.last_recommendation_sent_at,
           p.last_recommended_profile_id, z.tz, z.local_hour
    from public.profiles p
    cross join lateral (
      select public.user_timezone(p.timezone, p.country_code) as tz,
             extract(hour from (now() at time zone public.user_timezone(p.timezone, p.country_code)))::integer as local_hour
    ) z
    where p.account_status = 'active'
      and p.is_admin is not true
      and coalesce(p.notification_permission, '') <> 'denied'
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
      and z.local_hour between v_first_hour + mod(abs(hashtext(p.id::text || ((now() at time zone z.tz)::date)::text)), 2)
                           and v_end_hour
      and case p_row_key
            when 'recommended' then p.last_recommendation_sent_date is distinct from (now() at time zone z.tz)::date
            else p.last_similar_sent_date is distinct from (now() at time zone z.tz)::date
          end
      and (p.last_recommendation_sent_at is null
           or p.last_recommendation_sent_at < now() - v_min_gap
           or z.local_hour >= v_end_hour)
    order by p.last_recommendation_sent_at nulls first
    limit 20000
  loop
    begin
      v_today := (now() at time zone rec.tz)::date;
      v_last_hour := rec.local_hour >= v_end_hour;

      -- In the app right now, just got a like/match/message, or another push
      -- in the last 45 minutes: try next hour. The last hour sends regardless.
      if not v_last_hour then
        select h.hold_reason into v_hold from public.marketing_push_hold(rec.id, false, false, true) h;
        continue when v_hold is not null;
        continue when exists (
          select 1 from public.push_delivery_log l
          where l.user_id = rec.id and l.decision = 'sent' and l.created_at > now() - interval '45 minutes');
      end if;

      v_picks := public.ensure_recommendation_picks(rec.id);
      v_excluded := public.recommendation_excluded_ids(rec.id);
      -- Undecided picks, in order. The push only ever features someone current
      -- (active, not archived): the app's Circle deep link can't open archived
      -- profiles. Archived picks still count toward "your N picks".
      v_count := (
        select count(*) from unnest(coalesce(v_picks.profile_ids, '{}'::uuid[])) x
        join public.profiles cp on cp.id = x
        where not (x = any(v_excluded)) and cp.account_status = 'active');
      v_open_in := array(
        select x from unnest(coalesce(v_picks.in_range_ids, '{}'::uuid[])) with ordinality u(x, o)
        join public.profiles cp on cp.id = u.x
        where not (x = any(v_excluded)) and cp.account_status = 'active' and cp.is_archived is not true
        order by o);
      v_stretch_ok := v_picks.out_of_range_id is not null
        and not (v_picks.out_of_range_id = any(v_excluded))
        and exists (select 1 from public.profiles cp where cp.id = v_picks.out_of_range_id
                    and cp.account_status = 'active' and cp.is_archived is not true);

      v_candidate_id := null;
      v_kind := null;
      if p_row_key = 'recommended' then
        if cardinality(v_open_in) > 0 then
          v_candidate_id := v_open_in[1]; v_kind := 'daily';
        elsif v_stretch_ok then
          v_candidate_id := v_picks.out_of_range_id; v_kind := 'daily';
        end if;
      else
        if v_stretch_ok and v_picks.out_of_range_id is distinct from v_picks.midday_profile_id then
          v_candidate_id := v_picks.out_of_range_id; v_kind := 'stretch';
        else
          select x into v_candidate_id from unnest(v_open_in) x
          where x is distinct from v_picks.midday_profile_id limit 1;
          v_candidate_id := coalesce(v_candidate_id, v_open_in[1]);
          if v_candidate_id is not null then v_kind := 'reminder'; end if;
        end if;
      end if;

      v_name := nullif(trim(rec.first_name), '');
      if v_candidate_id is not null then
        select first_name, date_of_birth, city, interests, languages, pets, relationship_intent
        into v_candidate from public.profiles where id = v_candidate_id;
        if nullif(trim(coalesce(v_candidate.first_name, '')), '') is null then
          v_candidate_id := null;
        end if;
      end if;

      if v_candidate_id is not null then
        v_trait := public.pick_shared_trait(
          rec.interests, rec.languages, rec.pets, rec.relationship_intent,
          v_candidate.interests, v_candidate.languages, v_candidate.pets, v_candidate.relationship_intent);
        v_age := case when v_candidate.date_of_birth is not null
          then extract(year from age(v_candidate.date_of_birth))::int end;
        select c.title, c.body into v_title, v_body
        from public.recommendation_push_copy(
          v_kind,
          abs(hashtext(rec.id::text || v_today::text || p_row_key)),
          v_name,
          public.build_profile_push_body(v_candidate.first_name, v_age, v_candidate.city, v_trait),
          v_count) c;
        v_data := jsonb_build_object(
          'action', 'open_circle_profile',
          'profileId', v_candidate_id,
          'senderId', v_candidate_id,
          'picksDate', v_today::text,
          'pickKind', case when v_candidate_id = v_picks.out_of_range_id then 'out_of_range' else 'in_range' end);
      elsif p_row_key = 'similar' then
        v_title := coalesce(v_name || ', people', 'People') || ' you might click with';
        v_body := 'Not sure who''s your type? Open DripLove and chat anyway';
        v_data := jsonb_build_object('action', 'open_discover');
      else
        v_title := coalesce(v_name || ', new', 'New') || ' people to discover';
        v_body := 'See who''s on DripLove today. Say hi before someone else does.';
        v_data := jsonb_build_object('action', 'open_discover');
      end if;

      perform net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'),
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

      if v_picks.user_id is not null then
        if p_row_key = 'recommended' then
          update public.recommendation_picks set midday_profile_id = v_candidate_id
          where user_id = v_picks.user_id and pick_date = v_picks.pick_date;
        else
          update public.recommendation_picks set evening_profile_id = v_candidate_id
          where user_id = v_picks.user_id and pick_date = v_picks.pick_date;
        end if;
      end if;

      if p_row_key = 'recommended' then
        update public.profiles
        set last_recommendation_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = coalesce(v_candidate_id, last_recommended_profile_id)
        where id = rec.id;
      else
        update public.profiles
        set last_similar_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = coalesce(v_candidate_id, last_recommended_profile_id)
        where id = rec.id;
      end if;
    exception when others then
      raise warning 'send_recommendation_notifications(%): skipping user % after error: %', p_row_key, rec.id, sqlerrm;
    end;
  end loop;
end;
$function$;

-- 9. Permissions ------------------------------------------------------------------

revoke all on function public.recommendation_excluded_ids(uuid) from public, anon, authenticated;
revoke all on function public.compute_recommendation_picks(uuid, date) from public, anon, authenticated;
revoke all on function public.ensure_recommendation_picks(uuid) from public, anon, authenticated;
revoke all on function public.send_recommendation_notifications(text) from public, anon, authenticated;
revoke all on function public.get_my_daily_picks() from public, anon;
grant execute on function public.get_my_daily_picks() to authenticated;
grant execute on function public.recommendation_excluded_ids(uuid) to service_role;
grant execute on function public.compute_recommendation_picks(uuid, date) to service_role;
grant execute on function public.ensure_recommendation_picks(uuid) to service_role;
grant execute on function public.send_recommendation_notifications(text) to service_role;
grant execute on function public.get_my_daily_picks() to service_role;
