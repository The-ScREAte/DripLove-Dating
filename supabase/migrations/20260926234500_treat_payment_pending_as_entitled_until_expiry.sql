-- payment_pending is written exclusively by google-play-webhook's
-- SUBSCRIPTION_ON_HOLD/SUBSCRIPTION_IN_GRACE_PERIOD handler and (as of this
-- same change) apple-app-store-webhook's DID_FAIL_TO_RENEW handler when
-- Apple reports a real gracePeriodExpiresDate - both mean "this was a paid
-- premium subscription, the renewal charge failed, and the platform is
-- actively retrying while keeping the user's access alive." It never means
-- "awaiting a first payment" for any payment method in this codebase (no
-- Paystack/Stripe code path writes this status), so treating it the same
-- as 'active'/'cancelled' here cannot grant premium to someone who hasn't
-- actually paid.
--
-- Before this, the status-list check below only included 'active' and
-- 'cancelled', so the instant a webhook wrote status='payment_pending' to
-- signal "still entitled, retrying," is_active flipped to false immediately
-- - the exact opposite of what Apple/Google's grace/hold mechanism is for.

CREATE OR REPLACE FUNCTION public.get_current_subscription_status(p_user_id uuid)
 RETURNS TABLE(plan_name text, status text, expires_at timestamp with time zone, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  subscription_record RECORD;
  grace_cutoff timestamp with time zone := NOW() - INTERVAL '30 minutes';
BEGIN
  SELECT * INTO subscription_record
  FROM public.user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'free'::text,
      'active'::text,
      NULL::timestamp with time zone,
      true::boolean;
    RETURN;
  END IF;

  IF subscription_record.expires_at IS NOT NULL
     AND subscription_record.expires_at <= grace_cutoff
     AND subscription_record.status IN ('active', 'cancelled', 'payment_pending') THEN

    UPDATE public.user_subscriptions
    SET
      status = 'expired',
      plan_name = 'free',
      updated_at = NOW()
    WHERE id = subscription_record.id;

    RETURN QUERY SELECT
      'free'::text,
      'expired'::text,
      subscription_record.expires_at,
      false::boolean;
  ELSE
    RETURN QUERY SELECT
      subscription_record.plan_name::text,
      subscription_record.status::text,
      subscription_record.expires_at,
      (subscription_record.status IN ('active', 'cancelled', 'payment_pending') AND
       subscription_record.plan_name = 'premium' AND
       (subscription_record.expires_at IS NULL OR subscription_record.expires_at > grace_cutoff))::boolean;
  END IF;
END;
$function$;
