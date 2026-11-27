-- Circle tile counts sent the viewer's whole exclusion list (likes + matches + blocks + 30 days of passes: hundreds
-- of uuids) in the REQUEST URL (`id=not.in.(...)`), which the API rejects as 400 for active members; the app then showed
-- 0 members. This SECURITY INVOKER RPC takes the list in the POST body and applies exactly the same filters as the
-- client's applyCircleCountFilters(). (INVOKER: only public columns are read, RLS/grants apply as the caller.)
CREATE OR REPLACE FUNCTION public.count_circle_profiles(
  p_country_codes text[] DEFAULT NULL,
  p_allowed_genders text[] DEFAULT NULL,
  p_dob_earliest date DEFAULT NULL,
  p_dob_latest date DEFAULT NULL,
  p_excluded_ids uuid[] DEFAULT NULL,
  p_box_lat double precision DEFAULT NULL,
  p_box_lon double precision DEFAULT NULL,
  p_box_degrees double precision DEFAULT NULL,
  p_viewer_gender text DEFAULT NULL,
  p_active_only boolean DEFAULT false,
  p_relationship_intent text DEFAULT NULL,
  p_is_verified boolean DEFAULT NULL,
  p_family_plans text[] DEFAULT NULL,
  p_interest text DEFAULT NULL,
  p_has_music boolean DEFAULT NULL,
  p_has_social_media boolean DEFAULT NULL,
  p_has_pets boolean DEFAULT NULL
) RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT count(*)::integer
  FROM public.profiles p
  WHERE p.account_status = 'active' AND p.is_admin = false
    AND (NOT coalesce(p_active_only, false) OR p.is_archived = false)
    AND (p_country_codes IS NULL OR cardinality(p_country_codes) = 0 OR p.country_code = ANY (p_country_codes))
    AND (p_allowed_genders IS NULL OR cardinality(p_allowed_genders) = 0 OR p.gender = ANY (p_allowed_genders))
    AND (p_dob_earliest IS NULL OR p.date_of_birth >= p_dob_earliest)
    AND (p_dob_latest IS NULL OR p.date_of_birth <= p_dob_latest)
    AND (p_excluded_ids IS NULL OR cardinality(p_excluded_ids) = 0 OR NOT (p.id = ANY (p_excluded_ids)))
    AND (p_box_degrees IS NULL OR (
          p.latitude  >= p_box_lat - p_box_degrees AND p.latitude  <= p_box_lat + p_box_degrees
      AND p.longitude >= p_box_lon - p_box_degrees AND p.longitude <= p_box_lon + p_box_degrees))
    AND (p_viewer_gender IS NULL OR p.preference = p_viewer_gender OR p.preference = 'everyone')
    AND (p_relationship_intent IS NULL OR p.relationship_intent = p_relationship_intent)
    AND (NOT coalesce(p_is_verified, false) OR p.is_verified = true)
    AND (p_family_plans IS NULL OR p.family_plans = ANY (p_family_plans))
    AND (p_interest IS NULL OR p.interests @> ARRAY[p_interest])
    AND (NOT coalesce(p_has_music, false) OR p.favorites @> '[{"category":"Music"}]'::jsonb)
    AND (NOT coalesce(p_has_social_media, false) OR (p.social_media IS NOT NULL AND p.social_media <> ''))
    AND (NOT coalesce(p_has_pets, false) OR (p.pets IS NOT NULL AND p.pets <> '{}'::text[]));
$$;
REVOKE EXECUTE ON FUNCTION public.count_circle_profiles(text[], text[], date, date, uuid[], double precision, double precision, double precision, text, boolean, text, boolean, text[], text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_circle_profiles(text[], text[], date, date, uuid[], double precision, double precision, double precision, text, boolean, text, boolean, text[], text, boolean, boolean, boolean) TO authenticated, service_role;
