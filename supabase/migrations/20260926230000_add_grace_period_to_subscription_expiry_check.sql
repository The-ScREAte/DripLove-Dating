-- get_current_subscription_status runs on every app open/login and every 5
-- minutes while the app is open (useEnhancedSubscription.ts). It did a blind
-- expires_at <= NOW() comparison with zero grace period and an unconditional
-- write to expired/free the instant that passed - if Apple/Google's renewal
-- webhook was even slightly delayed past the exact expiry instant, a user
-- who WAS actually charged successfully could get flipped to free and
-- blocked from premium features until the webhook (or the hourly
-- subscription-checker backstop) caught up.
--
-- A 30-minute grace period gives the webhook realistic time to land before
-- this function ever writes 'expired'. Real, permanently-lapsed
-- subscriptions still get caught - just 30 minutes later than before,
-- which is invisible to a genuinely non-renewing user and protects a
-- genuinely renewing one.

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
  -- Get the user's current subscription
  SELECT * INTO subscription_record
  FROM public.user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no subscription exists, return free plan
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'free'::text,
      'active'::text,
      NULL::timestamp with time zone,
      true::boolean;
    RETURN;
  END IF;

  -- Check if subscription has expired (past the grace period) and should be downgraded
  IF subscription_record.expires_at IS NOT NULL
     AND subscription_record.expires_at <= grace_cutoff
     AND subscription_record.status IN ('active', 'cancelled') THEN

    -- Update to expired/free
    UPDATE public.user_subscriptions
    SET
      status = 'expired',
      plan_name = 'free',
      updated_at = NOW()
    WHERE id = subscription_record.id;

    -- Return updated status
    RETURN QUERY SELECT
      'free'::text,
      'expired'::text,
      subscription_record.expires_at,
      false::boolean;
  ELSE
    -- Return current status
    -- IMPORTANT: Cancelled subscriptions are still premium until expires_at
    -- (plus the grace period), same threshold as the demotion check above.
    RETURN QUERY SELECT
      subscription_record.plan_name::text,
      subscription_record.status::text,
      subscription_record.expires_at,
      (subscription_record.status IN ('active', 'cancelled') AND
       subscription_record.plan_name = 'premium' AND
       (subscription_record.expires_at IS NULL OR subscription_record.expires_at > grace_cutoff))::boolean;
  END IF;
END;
$function$;
