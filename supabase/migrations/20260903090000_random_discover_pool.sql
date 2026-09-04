-- Discover's profile-pool queries (both the active pool and the archived
-- top-up/fallback passes, for both free and premium viewers) all used
-- `.limit(N)` with no ORDER BY at all. Postgres/PostgREST make no ordering
-- guarantee without one, and in practice this returns the same stable slice
-- of rows (effectively insertion order) to every viewer, every time. Anyone
-- outside that fixed slice - e.g. someone who signed up months ago, past
-- whatever the "first N" happens to be - could go permanently unseen by
-- everyone, no matter how many times the feed reloads. This function
-- centralizes profile-pool fetching with genuine server-side randomization
-- (ORDER BY random()) so every eligible profile has a fair chance of
-- surfacing over time, for every viewer.
CREATE OR REPLACE FUNCTION public.get_random_discover_profiles(
  p_country_codes text[],
  p_allowed_genders text[],
  p_archived boolean,
  p_excluded_ids uuid[] DEFAULT '{}',
  p_limit integer DEFAULT 100,
  p_lat double precision DEFAULT NULL,
  p_lon double precision DEFAULT NULL,
  p_radius_degrees double precision DEFAULT NULL,
  -- Optional pre-computed candidate-id allowlist (e.g. a location service's
  -- nearby-users result). NULL means "no allowlist restriction" - still
  -- randomized, just without narrowing to a specific id set first.
  p_allowed_ids uuid[] DEFAULT NULL
)
RETURNS SETOF public.profiles
LANGUAGE sql
VOLATILE -- uses random(), so results legitimately differ call to call with
         -- identical arguments; STABLE would (correctly) let the planner
         -- cache/reuse one evaluation across multiple calls in the same
         -- query, silently defeating the randomization within that query.
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE p.country_code = ANY(p_country_codes)
    AND p.gender = ANY(p_allowed_genders)
    AND p.account_status = 'active'
    AND p.is_admin = false
    AND p.is_archived = p_archived
    AND NOT (p.id = ANY(COALESCE(p_excluded_ids, ARRAY[]::uuid[])))
    AND (p_allowed_ids IS NULL OR p.id = ANY(p_allowed_ids))
    AND (
      p_lat IS NULL OR p_lon IS NULL OR p_radius_degrees IS NULL
      OR (
        p.latitude BETWEEN p_lat - p_radius_degrees AND p_lat + p_radius_degrees
        AND p.longitude BETWEEN p_lon - p_radius_degrees AND p_lon + p_radius_degrees
      )
    )
  ORDER BY random()
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) TO authenticated;
