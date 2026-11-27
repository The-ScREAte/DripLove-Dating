-- Free members get the same distance cap as premium (5000 km), enough to cover a whole country. The radius never leaves
-- the member's home country, so this only means a free member sees everyone in their own country; what premium adds is
-- OTHER countries (unlocked_countries). Matches FREE_USER_MAX_DISTANCE_KM in the app.
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('circle_up_find_match', 'circle_up_list_candidates')
  LOOP
    def := pg_get_functiondef(r.oid);
    IF def LIKE '%THEN 5000 ELSE 600%' THEN
      EXECUTE replace(def, 'THEN 5000 ELSE 600', 'THEN 5000 ELSE 5000');
    END IF;
  END LOOP;
END $$;
