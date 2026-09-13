-- This project's schema has a default-privilege setup that auto-grants full
-- INSERT/UPDATE/DELETE (not just SELECT) to anon and authenticated on any
-- newly created table. RLS (SELECT-only policy) should already block writes
-- for those roles, but match_cooldowns must only ever be written by the
-- dissolve_matches()/check_and_dissolve_expired_matches() SECURITY DEFINER
-- functions - leaving broad table grants in place is an unnecessary latent
-- risk if a policy ever changes. Lock it down explicitly, matching the
-- get_email_auth_providers precedent from this project's forgot-password work.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.match_cooldowns FROM anon, authenticated;
REVOKE ALL ON public.match_cooldowns FROM anon;
GRANT SELECT ON public.match_cooldowns TO authenticated;
