-- Circle's category tiles ("Serious commitment", "Travel", etc.) need a real,
-- server-side filtered fetch when tapped - the existing random-discover RPC
-- has no way to add a category condition, and a plain REST query with a
-- large NOT IN (...) exclusion list (everyone already liked/passed/matched/
-- blocked) would blow past practical URL length once a user has interacted
-- with more than a few hundred people. An RPC sidesteps both: the exclusion
-- array travels in the POST body (no URL-length concern), and it can carry
-- one extra category condition alongside the same eligibility gates
-- get_random_discover_profiles already applies (country, gender, reciprocal
-- preference, active/non-admin).
--
-- Each tile only ever sets ONE of the p_relationship_intent/p_family_plans/
-- p_is_verified/p_interest params - whichever one is non-null is applied,
-- the rest are ignored (left NULL by the caller).

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
    AND (p_is_verified IS NULL OR p.is_verified = p_is_verified)
    AND (p_interest IS NULL OR p.interests @> ARRAY[p_interest])
  ORDER BY p.feed_random_weight
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text) TO authenticated;
