-- Fix from the scale audit / user's follow-up plan: AdminPage's "Users" tab
-- fetched EVERY non-admin profile in batches of 1000 (looping until
-- exhausted) just to filter and paginate 20 rows client-side. At a few
-- thousand users this is already a multi-hundred-KB payload and a full
-- client-side scan on every filter change; it gets strictly worse as the
-- user base grows and never plateaus.
--
-- This RPC does the same 9 filters (search, status, gender, preference,
-- country, relationship_intent, premium, activity bucket, archive) plus
-- ordering/pagination directly in Postgres via LIMIT/OFFSET, returning only
-- the current page of rows plus a total count (window function) for the
-- pager UI. The three admin tools that genuinely need the FULL user list to
-- do their own client-side matching (SmartMatchSuggestions, SmartLikeGiving,
-- ManualPremiumManager) are intentionally left on the existing bulk fetch -
-- only the Users-tab table (the actual "load everything to show 20 rows"
-- bottleneck) is being replaced here.

CREATE INDEX IF NOT EXISTS idx_profiles_admin_search
  ON public.profiles (is_admin, account_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_search_users_page(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_gender text DEFAULT 'all',
  p_preference text DEFAULT 'all',
  p_country text DEFAULT 'all',
  p_relationship_intent text DEFAULT 'all',
  p_premium text DEFAULT 'all',
  p_activity text DEFAULT 'all',
  p_archive text DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  account_status text,
  created_at timestamptz,
  city text,
  country text,
  date_of_birth date,
  is_admin boolean,
  gender text,
  preference text,
  relationship_intent text,
  last_login_at timestamptz,
  login_count integer,
  is_archived boolean,
  is_premium boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Table-qualified: RETURNS TABLE(id uuid, ...) creates an implicit OUT
  -- parameter named `id` that shadows an unqualified `id` here, making the
  -- comparison always compare the OUT param (null) to itself instead of the
  -- caller's profile row.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles admin_check
    WHERE admin_check.id = auth.uid() AND admin_check.is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.first_name, p.last_name, p.email, p.account_status, p.created_at,
    -- profiles.city is varchar(100) live, while every other text-ish column
    -- here is a plain text column - RETURN QUERY requires an exact type
    -- match against the RETURNS TABLE list (unlike a normal SELECT, which
    -- treats varchar/text as interchangeable), so this needs an explicit
    -- cast or the whole function throws "structure of query does not match
    -- function result type" at call time.
    p.city::text, p.country, p.date_of_birth, p.is_admin, p.gender, p.preference,
    p.relationship_intent, p.last_login_at, p.login_count, p.is_archived,
    EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = p.id AND us.plan_name = 'premium' AND us.status = 'active'
    ) AS is_premium,
    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  WHERE p.is_admin = false
    AND (p_search IS NULL OR p_search = '' OR (
      p.first_name ILIKE '%' || p_search || '%'
      OR p.last_name ILIKE '%' || p_search || '%'
      OR p.email ILIKE '%' || p_search || '%'
      OR p.city ILIKE '%' || p_search || '%'
      OR p.country ILIKE '%' || p_search || '%'
      OR p.id::text ILIKE '%' || p_search || '%'
    ))
    AND (p_status = 'all' OR p.account_status = p_status)
    AND (p_gender = 'all' OR p.gender = p_gender)
    AND (p_preference = 'all' OR p.preference = p_preference)
    AND (p_country = 'all' OR p.country = p_country)
    AND (p_relationship_intent = 'all' OR p.relationship_intent = p_relationship_intent)
    AND (p_archive = 'all' OR (p_archive = 'archived' AND p.is_archived = true) OR (p_archive = 'active' AND COALESCE(p.is_archived, false) = false))
    AND (
      p_activity = 'all' OR (
        CASE p_activity
          WHEN 'today' THEN COALESCE(p.last_login_at, p.created_at) >= date_trunc('day', now())
          WHEN '3_days' THEN COALESCE(p.last_login_at, p.created_at) >= now() - INTERVAL '3 days'
          WHEN '1_week' THEN COALESCE(p.last_login_at, p.created_at) >= now() - INTERVAL '7 days'
          WHEN '2_weeks' THEN COALESCE(p.last_login_at, p.created_at) >= now() - INTERVAL '14 days'
          WHEN '1_month' THEN COALESCE(p.last_login_at, p.created_at) >= now() - INTERVAL '30 days'
          WHEN '3_months' THEN COALESCE(p.last_login_at, p.created_at) >= now() - INTERVAL '90 days'
          WHEN 'inactive_month' THEN COALESCE(p.last_login_at, p.created_at) < now() - INTERVAL '30 days'
          ELSE true
        END
      )
    )
    AND (
      p_premium = 'all' OR (
        (p_premium = 'premium') = EXISTS (
          SELECT 1 FROM public.user_subscriptions us
          WHERE us.user_id = p.id AND us.plan_name = 'premium' AND us.status = 'active'
        )
      )
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_search_users_page(text, text, text, text, text, text, text, text, text, integer, integer) TO authenticated;
