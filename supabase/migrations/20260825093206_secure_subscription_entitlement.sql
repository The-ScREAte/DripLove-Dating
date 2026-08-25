-- SECURITY FIX: Prevent authenticated clients from self-granting or extending premium.
--
-- The existing RLS policies on public.user_subscriptions (from
-- 20250620040414_7a56d6de-473d-44a0-a55f-9fa0ddf57a01.sql) allow any authenticated
-- user to INSERT/UPDATE their own row with no restriction on values. Since all
-- entitlement fields (plan_name, status, expires_at, auto_renew) live on that same
-- row, a logged-in user could call the client SDK directly, e.g.:
--
--   supabase.from('user_subscriptions').upsert({
--     user_id: myUserId, plan_name: 'premium', status: 'active',
--     expires_at: '2099-01-01', auto_renew: false
--   })
--
-- ...and grant themselves free lifetime premium, completely bypassing Apple/Google/
-- Paystack receipt verification.
--
-- All legitimate activation paths (apple-app-store-webhook, google-play-webhook,
-- iap-receipt-validator, google-iap-validator, paystack-webhook, subscription-checker,
-- cancel-subscription, reactivate-subscription, admin-billing-trigger,
-- deactivate-user-payments) run as SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS
-- entirely -- so none of them are affected by tightening client policy.
--
-- Legitimate CLIENT-initiated writes (cancel, expire-on-read, undo-cancel before
-- expiry) never need to grant premium or extend expires_at, so they remain allowed.
--
-- One legitimate exception: public.admin_set_premium_subscription() grants/extends
-- premium from an admin's own authenticated session (it is SECURITY DEFINER and
-- already checks profiles.is_admin itself). Since that RPC runs under the caller's
-- session, auth.role() there is still 'authenticated', not 'service_role' -- so
-- verified admins are allowed through as well.

CREATE OR REPLACE FUNCTION public.protect_subscription_entitlement()
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

  -- Verified admins (profiles.is_admin) may manage any user's subscription,
  -- e.g. via admin_set_premium_subscription() or the admin panel.
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A client-initiated insert may never create a premium row directly.
    -- NOTE: status defaults to 'active' at the column level and that default is
    -- relied on by the on_profile_created_subscription trigger, which inserts the
    -- default (user_id, plan_name='free') row from the user's own session right
    -- after signup -- so status is intentionally NOT checked here, only plan_name.
    IF NEW.plan_name = 'premium' THEN
      RAISE EXCEPTION 'Not permitted to self-grant a premium subscription';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  -- Block granting premium from a non-premium state.
  IF NEW.plan_name = 'premium' AND OLD.plan_name IS DISTINCT FROM 'premium' THEN
    RAISE EXCEPTION 'Not permitted to self-grant a premium subscription';
  END IF;

  -- Block extending access further into the future than it already was.
  IF NEW.expires_at IS NOT NULL
     AND (OLD.expires_at IS NULL OR NEW.expires_at > OLD.expires_at) THEN
    RAISE EXCEPTION 'Not permitted to extend subscription expiry';
  END IF;

  -- Block reactivating from a state that was never entitled (only an existing
  -- 'active' or 'cancelled' -- i.e. cancelled-but-not-yet-expired -- row may be
  -- toggled back to 'active', e.g. the in-app "undo cancel" action).
  IF NEW.status = 'active' AND OLD.status NOT IN ('active', 'cancelled') THEN
    RAISE EXCEPTION 'Not permitted to activate subscription';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_subscription_entitlement_trigger ON public.user_subscriptions;
CREATE TRIGGER protect_subscription_entitlement_trigger
  BEFORE INSERT OR UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_subscription_entitlement();
