-- get_app_stats / get_active_users_for_date had no guard: any signed-in user could read app-wide stats.
-- Client callers (anon/authenticated) must be admins; server callers (service role / cron) are unaffected.
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('get_app_stats','get_active_users_for_date') LOOP
    def := pg_get_functiondef(r.oid);
    IF def LIKE '%admin_stats_guard%' THEN CONTINUE; END IF;
    EXECUTE regexp_replace(def, '\mBEGIN\M',
      $g$BEGIN /*admin_stats_guard*/ IF auth.role() IN ('anon','authenticated') AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF; $g$, 'i');
  END LOOP;
END $$;
