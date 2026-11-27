-- =====================================================================================
-- STAGED MIGRATION - DO NOT APPLY until the rollout runbook (README.md) says so.
-- Lives in supabase/migrations_staged/ so the Supabase CLI does not pick it up.
--
-- Goal: stop every signed-in user from reading every column (email, zip_code,
-- face_descriptor, ...) of other users' rows in public.profiles.
--
-- What it does
--   1. helper  _profiles_caller_is_admin()          (SECURITY DEFINER, internal)
--   2. get_my_profile()                              caller's own FULL row
--   3. admin_get_profiles(...)                       admin-only full rows (+ filters, paging)
--   4. _mask_profile(row, is_admin)                  NULLs non-public columns for other users
--   5. get_random_discover_profiles / get_circle_category_profiles (x2 overloads):
--        original bodies renamed to _raw_<name> (filters untouched), new same-signature
--        wrappers return the rows with non-public columns masked unless the row is the
--        caller's own or the caller is an admin (or no JWT user at all = service/backend).
--   6. REVOKE SELECT on profiles from authenticated/anon, GRANT SELECT (<public columns>) to authenticated.
--
-- Untouched: INSERT/UPDATE/DELETE grants, RLS policies, service_role/postgres (table owner and
-- BYPASSRLS roles keep full access), SECURITY DEFINER functions/triggers (run as owner).
-- RLS policies on other tables that do "EXISTS (select 1 from profiles where id = auth.uid()
-- and is_admin)" keep working because id and is_admin are in the public column list.
--
-- NEW COLUMNS: a column added to profiles later is NOT readable by authenticated until you
-- run  GRANT SELECT (new_col) ON public.profiles TO authenticated;  (and add it to
-- src/utils/profileColumns.ts). Internal-only columns need nothing.
-- =====================================================================================

-- Safety net: refuse to run if profiles has a column this file has not classified.
do $guard$
declare
  v_public text[] := array[
    'id', 'first_name', 'last_name', 'date_of_birth', 'gender', 'preference', 'bio', 'interests', 'relationship_intent', 'created_at', 'updated_at', 'country', 'country_code', 'city', 'is_custom_city', 'latitude', 'longitude', 'smoking', 'drinking', 'exercise_level', 'sleeping_schedule', 'occupation', 'industry', 'education_level', 'introvert_extrovert', 'spontaneous_planner', 'messy_organized', 'fun_fact', 'perfect_first_date', 'last_googled', 'adinkra_symbols', 'favorites', 'height_cm', 'languages', 'family_plans', 'communication_style', 'love_style', 'pets', 'social_media', 'free_tonight', 'account_status', 'is_admin', 'is_archived', 'is_verified', 'last_login_at', 'current_streak', 'profile_completion', 'min_age', 'max_age', 'max_distance', 'distance_preference', 'unlocked_countries', 'preferred_language', 'terms_accepted', 'has_rated_app', 'like_me_cooldown_until'
  ];
  v_internal text[] := array[
    'email', 'zip_code', 'face_descriptor', 'terms_accepted_at', 'promo_code_used', 'login_count', 'active_session_count', 'timezone', 'notification_permission', 'notification_permission_updated_at', 'badge_count', 'last_reengagement_sent_at', 'longest_streak', 'last_streak_date', 'last_streak_reminder_sent_date', 'last_recommendation_sent_date', 'recommendation_sends_today', 'last_recommendation_sent_at', 'last_recommended_profile_id', 'last_similar_sent_date', 'last_game_notification_sent_week', 'last_app_open_at', 'total_swipe_count', 'rated_app_at', 'visibility_boost_until', 'visibility_boost_multiplier', 'feed_random_weight'
  ];
  v_unknown text;
begin
  select string_agg(a.attname, ', ') into v_unknown
  from pg_attribute a
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname <> all (v_public || v_internal);
  if v_unknown is not null then
    raise exception 'profiles has unclassified columns: % - add them to the public or internal list first', v_unknown;
  end if;
end
$guard$;

-- 1. helper ---------------------------------------------------------------------------------
create or replace function public._profiles_caller_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public._profiles_caller_is_admin() from public, anon, authenticated;

-- 2. get_my_profile --------------------------------------------------------------------------
create or replace function public.get_my_profile()
returns setof public.profiles
language sql stable security definer set search_path = ''
as $$
  select p.* from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated, service_role;

-- 3. admin_get_profiles ----------------------------------------------------------------------
-- p_filters keys (all optional): is_admin, is_archived (bool); account_status, gender, preference,
-- relationship_intent (text); countries (text[]); exclude_id (uuid); archive
-- ('not_archived' | 'archived_only'); exclude_statuses (text[]); country_not_null, email_not_null (bool).
create or replace function public.admin_get_profiles(
  p_ids uuid[] default null,
  p_limit integer default 1000,
  p_offset integer default 0,
  p_filters jsonb default '{}'::jsonb,
  p_newest_first boolean default false
)
returns setof public.profiles
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_countries text[];
  v_excl text[];
begin
  if not public._profiles_caller_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if v_f ? 'countries' then
    select coalesce(array_agg(x), '{}') into v_countries from jsonb_array_elements_text(v_f->'countries') x;
  end if;
  if v_f ? 'exclude_statuses' then
    select coalesce(array_agg(x), '{}') into v_excl from jsonb_array_elements_text(v_f->'exclude_statuses') x;
  end if;

  return query
  select p.*
  from public.profiles p
  where (p_ids is null or p.id = any (p_ids))
    and (not (v_f ? 'is_admin') or p.is_admin = (v_f->>'is_admin')::boolean)
    and (not (v_f ? 'is_archived') or p.is_archived = (v_f->>'is_archived')::boolean)
    and (not (v_f ? 'account_status') or p.account_status = v_f->>'account_status')
    and (not (v_f ? 'gender') or p.gender = v_f->>'gender')
    and (not (v_f ? 'preference') or p.preference = v_f->>'preference')
    and (not (v_f ? 'relationship_intent') or p.relationship_intent = v_f->>'relationship_intent')
    and (v_countries is null or p.country = any (v_countries))
    and (not (v_f ? 'exclude_id') or p.id <> (v_f->>'exclude_id')::uuid)
    and (coalesce(v_f->>'archive', '') <> 'not_archived' or coalesce(p.is_archived, false) = false)
    and (coalesce(v_f->>'archive', '') <> 'archived_only' or p.is_archived = true)
    and (v_excl is null or p.account_status <> all (v_excl))
    and (coalesce((v_f->>'country_not_null')::boolean, false) = false or p.country is not null)
    and (coalesce((v_f->>'email_not_null')::boolean, false) = false or p.email is not null)
  order by
    case when p_newest_first then p.created_at end desc nulls last,
    p.id asc
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;
revoke all on function public.admin_get_profiles(uuid[], integer, integer, jsonb, boolean) from public, anon;
grant execute on function public.admin_get_profiles(uuid[], integer, integer, jsonb, boolean) to authenticated, service_role;

-- 4. masking helper --------------------------------------------------------------------------
create or replace function public._mask_profile(p public.profiles, p_is_admin boolean)
returns public.profiles
language plpgsql stable set search_path = ''
as $$
declare
  v public.profiles := p;
  v_uid uuid := auth.uid();
begin
  -- no JWT user (service role / backend), the caller's own row, or an admin: full row
  if v_uid is null or p.id = v_uid or coalesce(p_is_admin, false) then
    return p;
  end if;
  v.email := null;
  v.zip_code := null;
  v.face_descriptor := null;
  v.terms_accepted_at := null;
  v.promo_code_used := null;
  v.login_count := null;
  v.active_session_count := null;
  v.timezone := null;
  v.notification_permission := null;
  v.notification_permission_updated_at := null;
  v.badge_count := null;
  v.last_reengagement_sent_at := null;
  v.longest_streak := null;
  v.last_streak_date := null;
  v.last_streak_reminder_sent_date := null;
  v.last_recommendation_sent_date := null;
  v.recommendation_sends_today := null;
  v.last_recommendation_sent_at := null;
  v.last_recommended_profile_id := null;
  v.last_similar_sent_date := null;
  v.last_game_notification_sent_week := null;
  v.last_app_open_at := null;
  v.total_swipe_count := null;
  v.rated_app_at := null;
  v.visibility_boost_until := null;
  v.visibility_boost_multiplier := null;
  v.feed_random_weight := null;
  return v;
end
$$;
revoke all on function public._mask_profile(public.profiles, boolean) from public, anon, authenticated;

-- 5. masking versions of the SETOF profiles RPCs ----------------------------------------------
-- Original function bodies (all filters) are kept byte-for-byte under a private name
-- (the 12-arg circle overload gets a _12 suffix: with the same name, a 12-arg call would be
-- ambiguous against the 16-arg overload's defaults).
alter function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[])
  rename to _raw_get_random_discover_profiles;
alter function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean)
  rename to _raw_get_circle_category_profiles_12;
alter function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean, boolean, double precision, double precision, double precision)
  rename to _raw_get_circle_category_profiles;

revoke all on function public._raw_get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) from public, anon, authenticated;
revoke all on function public._raw_get_circle_category_profiles_12(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public._raw_get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean, boolean, double precision, double precision, double precision) from public, anon, authenticated;

create function public.get_random_discover_profiles(
  p_country_codes text[], p_allowed_genders text[], p_archived boolean,
  p_excluded_ids uuid[] default '{}'::uuid[], p_limit integer default 100,
  p_lat double precision default null, p_lon double precision default null,
  p_radius_degrees double precision default null, p_allowed_ids uuid[] default null
)
returns setof public.profiles
language sql stable security definer set search_path to ''
as $$
  select m.*
  from public._raw_get_random_discover_profiles(
         p_country_codes, p_allowed_genders, p_archived, p_excluded_ids, p_limit,
         p_lat, p_lon, p_radius_degrees, p_allowed_ids) r
  cross join lateral public._mask_profile(r, (select public._profiles_caller_is_admin())) m;
$$;

-- Locked Circle categories (free users): relationship intent, verified, travel, music, social. The app only hid the
-- tiles; once profiles are locked down this RPC is the only way to list these people, so enforce it here.
create or replace function public._circle_locked_filter_ok(
  p_relationship_intent text, p_is_verified boolean, p_interest text, p_has_music boolean, p_has_social_media boolean
) returns boolean
language sql stable security definer set search_path to ''
as $$
  select
    coalesce(auth.role(), '') not in ('anon', 'authenticated')          -- server callers
    or public._is_premium_now(auth.uid())
    or (select public._profiles_caller_is_admin())
    or not (
      p_relationship_intent is not null
      or p_is_verified is true
      or p_interest = 'Travel'
      or p_has_music is true
      or p_has_social_media is true
    );
$$;
revoke all on function public._circle_locked_filter_ok(text, boolean, text, boolean, boolean) from public, anon, authenticated;

create function public.get_circle_category_profiles(
  p_country_codes text[], p_allowed_genders text[], p_viewer_gender text,
  p_excluded_ids uuid[] default '{}'::uuid[], p_limit integer default 60,
  p_relationship_intent text default null, p_family_plans text[] default null,
  p_is_verified boolean default null, p_interest text default null,
  p_has_music boolean default null, p_has_social_media boolean default null,
  p_has_pets boolean default null
)
returns setof public.profiles
language sql stable security definer set search_path to ''
as $$
  select m.*
  from public._raw_get_circle_category_profiles_12(
         p_country_codes, p_allowed_genders, p_viewer_gender, p_excluded_ids, p_limit,
         p_relationship_intent, p_family_plans, p_is_verified, p_interest,
         p_has_music, p_has_social_media, p_has_pets) r
  cross join lateral public._mask_profile(r, (select public._profiles_caller_is_admin())) m
  where public._circle_locked_filter_ok(p_relationship_intent, p_is_verified, p_interest, p_has_music, p_has_social_media);
$$;

create function public.get_circle_category_profiles(
  p_country_codes text[], p_allowed_genders text[], p_viewer_gender text,
  p_excluded_ids uuid[] default '{}'::uuid[], p_limit integer default 60,
  p_relationship_intent text default null, p_family_plans text[] default null,
  p_is_verified boolean default null, p_interest text default null,
  p_has_music boolean default null, p_has_social_media boolean default null,
  p_has_pets boolean default null, p_archived boolean default false,
  p_lat double precision default null, p_lon double precision default null,
  p_radius_degrees double precision default null
)
returns setof public.profiles
language sql stable security definer set search_path to ''
as $$
  select m.*
  from public._raw_get_circle_category_profiles(
         p_country_codes, p_allowed_genders, p_viewer_gender, p_excluded_ids, p_limit,
         p_relationship_intent, p_family_plans, p_is_verified, p_interest,
         p_has_music, p_has_social_media, p_has_pets, p_archived, p_lat, p_lon, p_radius_degrees) r
  cross join lateral public._mask_profile(r, (select public._profiles_caller_is_admin())) m
  where public._circle_locked_filter_ok(p_relationship_intent, p_is_verified, p_interest, p_has_music, p_has_social_media);
$$;

revoke all on function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) from public, anon;
revoke all on function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean) from public, anon;
revoke all on function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean, boolean, double precision, double precision, double precision) from public, anon;
grant execute on function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) to authenticated, service_role;
grant execute on function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean, boolean, double precision, double precision, double precision) to authenticated, service_role;

-- 6. column lockdown -------------------------------------------------------------------------
-- INSERT/UPDATE/DELETE grants are intentionally NOT touched.
revoke select on public.profiles from public, anon, authenticated;
grant select (
    id,
    first_name,
    last_name,
    date_of_birth,
    gender,
    preference,
    bio,
    interests,
    relationship_intent,
    created_at,
    updated_at,
    country,
    country_code,
    city,
    is_custom_city,
    latitude,
    longitude,
    smoking,
    drinking,
    exercise_level,
    sleeping_schedule,
    occupation,
    industry,
    education_level,
    introvert_extrovert,
    spontaneous_planner,
    messy_organized,
    fun_fact,
    perfect_first_date,
    last_googled,
    adinkra_symbols,
    favorites,
    height_cm,
    languages,
    family_plans,
    communication_style,
    love_style,
    pets,
    social_media,
    free_tonight,
    account_status,
    is_admin,
    is_archived,
    is_verified,
    last_login_at,
    current_streak,
    profile_completion,
    min_age,
    max_age,
    max_distance,
    distance_preference,
    unlocked_countries,
    preferred_language,
    terms_accepted,
    has_rated_app,
    like_me_cooldown_until
) on public.profiles to authenticated;

notify pgrst, 'reload schema';
