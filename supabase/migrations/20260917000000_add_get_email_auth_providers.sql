-- Backs the "Forgot Password" flow's Google/Apple detection: given an email,
-- lets a service-role edge function (check-auth-provider) find out whether
-- that account was created via Google, Apple, or plain email/password -
-- WITHOUT exposing the anon/authenticated roles to auth.users or
-- auth.identities directly (those schemas are never exposed via PostgREST).
-- SECURITY DEFINER so it can read auth.identities despite the caller having
-- no direct grant on that schema; only ever called from the edge function
-- using the service-role key, never granted to anon/authenticated.
CREATE OR REPLACE FUNCTION public.get_email_auth_providers(p_email text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_providers text[];
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT array_agg(DISTINCT provider) INTO v_providers
  FROM auth.identities
  WHERE user_id = v_user_id;

  RETURN COALESCE(v_providers, ARRAY[]::text[]);
END;
$function$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which
-- includes anon/authenticated - without this REVOKE, this function would be
-- callable directly from the client with just the anon key via
-- supabase.rpc(), letting anyone mass-check which emails exist and their
-- provider with no rate limiting. It must only ever be reachable through the
-- check-auth-provider edge function (which runs with the service role).
REVOKE EXECUTE ON FUNCTION public.get_email_auth_providers(text) FROM PUBLIC, anon, authenticated;
