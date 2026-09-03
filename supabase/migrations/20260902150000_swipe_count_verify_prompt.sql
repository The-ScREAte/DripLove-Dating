-- Lifetime swipe counter, used to trigger the "verify your identity" prompt
-- for unverified users after a configurable number of swipes (see
-- SWIPES_BEFORE_VERIFY_PROMPT in DiscoverPage.tsx). This is a simple
-- ever-incrementing count, distinct from user_usage.swipes_used (which is
-- daily-bucketed, for the free-tier swipe limit).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_swipe_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_swipe_count(user_id_param uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_count integer;
BEGIN
  IF auth.uid() != user_id_param THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET total_swipe_count = COALESCE(total_swipe_count, 0) + 1
  WHERE id = user_id_param
  RETURNING total_swipe_count INTO new_count;

  RETURN new_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.increment_swipe_count TO authenticated;
