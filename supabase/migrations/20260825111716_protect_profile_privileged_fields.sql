-- SECURITY FIX: Prevent authenticated clients from self-granting admin rights,
-- self-marking their own "verified" badge, or writing face verification data.
--
-- public.profiles RLS (see 20251217062814_.sql, "Users can modify their own
-- profile") only checks `auth.uid() = id` on UPDATE -- it does not restrict which
-- columns can change. That means, before this fix, a logged-in user could call the
-- client SDK directly, e.g.:
--
--   supabase.from('profiles').update({ is_admin: true }).eq('id', myUserId)
--   supabase.from('profiles').update({ is_verified: true }).eq('id', myUserId)
--   supabase.from('profiles').update({ face_descriptor: 'verified' }).eq('id', myUserId)
--
-- ...and grant themselves admin access (which several other RLS policies and
-- SECURITY DEFINER RPCs trust, e.g. protect_subscription_entitlement()), or the
-- verified badge, without ever completing the real checks. The face-verify edge
-- function's index_face action has been updated to write face_descriptor itself
-- (service role, after confirming caller identity) rather than trusting the
-- client, but this trigger closes the gap defense-in-depth and for is_admin /
-- is_verified, which have no legitimate client-side writer at all.
--
-- Mirrors the same pattern used in 20260825093206_secure_subscription_entitlement.sql
-- for public.user_subscriptions.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Server-side callers (edge functions, cron, admin tools) use the service role
  -- key, which connects as the Postgres 'service_role' -- always trusted.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Verified admins may manage any profile (including admin/verification flags)
  -- via the admin panel. Checked against the CALLER's own row via auth.uid(),
  -- not the row being written, so this can't be used to self-escalate.
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE THEN
      RAISE EXCEPTION 'Not permitted to self-grant admin access';
    END IF;
    IF NEW.is_verified IS TRUE THEN
      RAISE EXCEPTION 'Not permitted to self-grant verified status';
    END IF;
    IF NEW.face_descriptor IS NOT NULL THEN
      RAISE EXCEPTION 'Not permitted to set face verification data';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Not permitted to change admin status';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'Not permitted to change verification status';
  END IF;

  IF NEW.face_descriptor IS DISTINCT FROM OLD.face_descriptor THEN
    RAISE EXCEPTION 'Not permitted to modify face verification data';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_profile_privileged_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_privileged_fields_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_fields();
