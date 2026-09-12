-- Fix #4 from the scale audit: get_random_discover_profiles used
-- `ORDER BY random()`, which forces Postgres to materialize and sort every
-- row that passes the WHERE filter before LIMIT is applied - no index can
-- short-circuit this, and it's the app's single highest-frequency query
-- (every Discover deck refill). Cost grows with the eligible pool size, so
-- this got slower precisely as the user base grew.
--
-- Fix: a stable, indexed "feed_random_weight" column reshuffled once a day
-- by a cron job, ordered by directly instead of computing a fresh random()
-- per row per call. Users still see a shuffled feed (the shuffle just
-- changes once a day instead of on every single call), and every eligible
-- profile still gets a fair rotation through the pool - the original
-- fairness goal this function was written for - but the query itself
-- becomes a plain indexed ORDER BY + LIMIT instead of a full sort.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_random_weight double precision NOT NULL DEFAULT random();

-- Serves the exact filter set get_random_discover_profiles applies before
-- its ORDER BY: two point-equality columns first (most selective / cheapest
-- to filter), then the ORDER BY column last so the index itself is already
-- in the right order for the LIMIT to pull straight off the front of it.
CREATE INDEX IF NOT EXISTS idx_profiles_discover_feed
  ON public.profiles (account_status, is_archived, feed_random_weight)
  WHERE is_admin = false;

CREATE OR REPLACE FUNCTION public.get_random_discover_profiles(
  p_country_codes text[],
  p_allowed_genders text[],
  p_archived boolean,
  p_excluded_ids uuid[] DEFAULT '{}',
  p_limit integer DEFAULT 100,
  p_lat double precision DEFAULT NULL,
  p_lon double precision DEFAULT NULL,
  p_radius_degrees double precision DEFAULT NULL,
  p_allowed_ids uuid[] DEFAULT NULL
)
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE -- feed_random_weight only changes via the nightly cron job now, not
       -- per-call like random() did - safe (and desirable) for the planner
       -- to treat this as stable within one query/transaction.
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
  ORDER BY p.feed_random_weight
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) TO authenticated;

-- Nightly reshuffle so the feed keeps rotating fairly over time instead of
-- settling into one fixed order forever. Unschedule first so re-running
-- this migration doesn't create a duplicate cron job.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reshuffle-discover-feed-weights') THEN
    PERFORM cron.unschedule('reshuffle-discover-feed-weights');
  END IF;
END;
$do$;

SELECT cron.schedule(
  'reshuffle-discover-feed-weights',
  '0 3 * * *',
  $cron$UPDATE public.profiles SET feed_random_weight = random()$cron$
);
