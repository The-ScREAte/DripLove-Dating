-- find_matches_by_location always failed with 42804 ("Returned type character varying(100) does not match expected
-- type text"): profiles.city / country_code are varchar but the function declares text. Cast them.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'find_matches_by_location' LIMIT 1;
  IF def IS NOT NULL AND def NOT LIKE '%s.city::text%' THEN
    EXECUTE replace(def, E'    s.city,\n    s.country_code\n  from scored s', E'    s.city::text,\n    s.country_code::text\n  from scored s');
  END IF;
END $$;
