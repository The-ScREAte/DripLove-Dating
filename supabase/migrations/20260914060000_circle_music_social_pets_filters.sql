-- Three new Circle category tiles: Music Lovers (has a "Music" favorite),
-- Social Butterflies (has social_media set), Pet Lovers (has pets set).
-- Adds matching optional params to the category-browse RPC (mirrors the
-- existing p_interest/p_is_verified pattern - exactly one of these is ever
-- set per tile, the rest stay NULL and are ignored).
--
-- Adding params changes the function's argument-type signature, so
-- CREATE OR REPLACE below would otherwise just create a second, ambiguous
-- overload alongside the old 9-arg version rather than truly replacing it -
-- drop the old signature explicitly first.
DROP FUNCTION IF EXISTS public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text);

CREATE OR REPLACE FUNCTION public.get_circle_category_profiles(
  p_country_codes text[],
  p_allowed_genders text[],
  p_viewer_gender text,
  p_excluded_ids uuid[] DEFAULT '{}',
  p_limit integer DEFAULT 60,
  p_relationship_intent text DEFAULT NULL,
  p_family_plans text[] DEFAULT NULL,
  p_is_verified boolean DEFAULT NULL,
  p_interest text DEFAULT NULL,
  p_has_music boolean DEFAULT NULL,
  p_has_social_media boolean DEFAULT NULL,
  p_has_pets boolean DEFAULT NULL
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
    AND (
      p_has_music IS NULL
      OR (COALESCE(p.favorites, '[]'::jsonb) @> '[{"category":"Music"}]'::jsonb) = p_has_music
    )
    AND (
      p_has_social_media IS NULL
      OR (p.social_media IS NOT NULL AND btrim(p.social_media) <> '') = p_has_social_media
    )
    AND (
      p_has_pets IS NULL
      OR (p.pets IS NOT NULL AND array_length(p.pets, 1) > 0) = p_has_pets
    )
  ORDER BY p.feed_random_weight
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean) TO authenticated;
