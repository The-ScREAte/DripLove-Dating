-- Round 3 (pentest findings, 2026-11-27)
-- 1. promo_codes (influencer password hashes, emails, earnings) was readable by anyone incl. anon.
--    Only admins (policy "Admins can manage promo codes") and service-role edge functions use the table;
--    public validation goes through the SECURITY DEFINER validate_promo_code().
DROP POLICY IF EXISTS "Anyone can view active promo codes" ON public.promo_codes;

-- 2. storage: anyone could list every user's photo folder; users could list each other's objects.
--    Public image URLs keep working (public bucket); listing/selecting is limited to your own folder.
DROP POLICY IF EXISTS "Users can view all approved photos" ON storage.objects;
CREATE POLICY "Users can view own photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3. maintenance / counter functions must not be client-callable
REVOKE EXECUTE ON FUNCTION public.delete_old_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_messages() TO service_role;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'increment_unread_count' LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- 4. future functions are not executable by PUBLIC/anon unless explicitly granted
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
