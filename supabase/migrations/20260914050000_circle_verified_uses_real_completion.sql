-- The Circle "Verified Users" tile filtered on profiles.is_verified, which is
-- a real face-verification flag set only by the face-verify edge function or
-- an admin (see 20260825111716_protect_profile_privileged_fields.sql) - and
-- in the live data, NOT ONE active profile has ever had it set to true. That
-- made the tile permanently empty for every single user, forever, since the
-- flag has no real adoption yet.
--
-- Everywhere else in the app (Discover/Circle/Liked Me/profile preview), the
-- checkmark a user actually sees as "Verified" is a completely different,
-- client-computed thing: calculateProfileCompletion() in
-- src/utils/profileCompletion.ts, which shows the badge at >=85% profile
-- completion across 9 weighted criteria. That's the "verified" regular users
-- actually recognize, and it has real matching profiles behind it -
-- is_verified does not. This reimplements that exact formula once, in SQL,
-- as a small reusable function, and points both the category-browse RPC and
-- a new dedicated count RPC (the tile's own displayed number was ALSO
-- silently always reading the dead is_verified column) at it.
--
-- p_is_verified has no other caller (grep confirms only this one Circle tile
-- ever sets it), so its external contract (a plain boolean, NULL = don't
-- filter) is unchanged - only what "verified" means under the hood changes,
-- to match what users actually see elsewhere.
CREATE OR REPLACE FUNCTION public.is_circle_verified_profile(p public.profiles)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (
    (CASE WHEN (
      SELECT COUNT(*) FROM public.user_images ui
      WHERE ui.user_id = p.id AND ui.is_approved IS DISTINCT FROM false
    ) >= 3 THEN 15 ELSE 0 END)
    + (CASE WHEN p.first_name IS NOT NULL AND btrim(p.first_name) <> ''
             AND p.last_name IS NOT NULL AND btrim(p.last_name) <> ''
             AND p.bio IS NOT NULL AND btrim(p.bio) <> ''
             AND p.date_of_birth IS NOT NULL
       THEN 15 ELSE 0 END)
    + (CASE WHEN p.city IS NOT NULL AND btrim(p.city) <> ''
             AND p.country IS NOT NULL AND btrim(p.country) <> ''
             AND (p.max_distance IS NOT NULL OR p.distance_preference IS NOT NULL)
       THEN 10 ELSE 0 END)
    + (CASE WHEN p.gender IS NOT NULL AND btrim(p.gender) <> ''
             AND p.preference IS NOT NULL AND btrim(p.preference) <> ''
       THEN 10 ELSE 0 END)
    + (CASE WHEN p.smoking IS NOT NULL AND btrim(p.smoking) <> ''
             AND p.drinking IS NOT NULL AND btrim(p.drinking) <> ''
             AND p.exercise_level IS NOT NULL AND btrim(p.exercise_level) <> ''
             AND p.sleeping_schedule IS NOT NULL AND btrim(p.sleeping_schedule) <> ''
       THEN 10 ELSE 0 END)
    + (CASE WHEN p.occupation IS NOT NULL AND btrim(p.occupation) <> ''
             AND p.education_level IS NOT NULL AND btrim(p.education_level) <> ''
       THEN 10 ELSE 0 END)
    + (CASE WHEN p.introvert_extrovert IS NOT NULL
             AND p.spontaneous_planner IS NOT NULL
             AND p.messy_organized IS NOT NULL
       THEN 10 ELSE 0 END)
    + (CASE WHEN (p.fun_fact IS NOT NULL AND btrim(p.fun_fact) <> '')
             OR (p.perfect_first_date IS NOT NULL AND btrim(p.perfect_first_date) <> '')
             OR (p.last_googled IS NOT NULL AND btrim(p.last_googled) <> '')
       THEN 10 ELSE 0 END)
    + (CASE WHEN p.interests IS NOT NULL AND array_length(p.interests, 1) >= 3
       THEN 10 ELSE 0 END)
  ) >= 85;
$$;

CREATE OR REPLACE FUNCTION public.get_circle_category_profiles(
  p_country_codes text[],
  p_allowed_genders text[],
  p_viewer_gender text,
  p_excluded_ids uuid[] DEFAULT '{}',
  p_limit integer DEFAULT 60,
  p_relationship_intent text DEFAULT NULL,
  p_family_plans text[] DEFAULT NULL,
  p_is_verified boolean DEFAULT NULL,
  p_interest text DEFAULT NULL
)
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE p.country_code = ANY(p_country_codes)
    AND p.gender = ANY(p_allowed_genders)
    AND p.account_status = 'active'
    AND p.is_admin = false
    AND NOT (p.id = ANY(COALESCE(p_excluded_ids, ARRAY[]::uuid[])))
    -- Reciprocal preference: p_allowed_genders above already covers "genders
    -- the viewer is interested in" - this covers the other direction, "this
    -- profile is open to the viewer's own gender."
    AND (p.preference = p_viewer_gender OR p.preference = 'everyone')
    AND (p_relationship_intent IS NULL OR p.relationship_intent = p_relationship_intent)
    AND (p_family_plans IS NULL OR p.family_plans = ANY(p_family_plans))
    AND (p_is_verified IS NULL OR public.is_circle_verified_profile(p) = p_is_verified)
    AND (p_interest IS NULL OR p.interests @> ARRAY[p_interest])
  ORDER BY p.feed_random_weight
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text) TO authenticated;

-- Dedicated count for the tile's own displayed number - the plain REST count
-- query CirclePage otherwise uses for every other tile can't express the
-- formula above, and was silently counting the dead is_verified column
-- (always 0) before this.
CREATE OR REPLACE FUNCTION public.count_circle_verified_profiles(
  p_country_codes text[],
  p_allowed_genders text[],
  p_viewer_gender text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::integer
  FROM public.profiles p
  WHERE p.country_code = ANY(p_country_codes)
    AND p.gender = ANY(p_allowed_genders)
    AND p.account_status = 'active'
    AND p.is_admin = false
    AND (p.preference = p_viewer_gender OR p.preference = 'everyone')
    AND public.is_circle_verified_profile(p);
$$;

GRANT EXECUTE ON FUNCTION public.count_circle_verified_profiles(text[], text[], text) TO authenticated;
