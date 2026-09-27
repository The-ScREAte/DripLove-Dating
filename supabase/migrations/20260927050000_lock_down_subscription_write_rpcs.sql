-- Security audit finding (pre-ship review of the payment system): several
-- subscription-mutating RPCs were callable by ANYONE - including fully
-- unauthenticated (anon) callers - via the public REST API
-- (/rest/v1/rpc/<name>), because they carried no caller check at all beyond
-- SECURITY DEFINER.
--
-- handle_payment_failure(p_user_id, p_reason) was the real, exploitable one:
-- it has a legitimate caller (src/iap.ts, always passing the caller's own
-- id) and several trusted server-side callers (paystack-webhook,
-- google-play-webhook, iap-receipt-validator, paystack-recurring-billing,
-- all via the service role key) - but nothing stopped a third party from
-- calling it directly with ANY other user's id and instantly downgrading
-- that person's paid subscription to 'payment_failed'/free, for free,
-- repeatedly. Unlike a premium *grant*, this downgrade path isn't caught by
-- the protect_subscription_entitlement trigger (which only blocks upward
-- entitlement changes), so it was live. Fixed by requiring the caller be
-- either the target user themselves or the trusted service role.
--
-- Separately, a full end-to-end trace of the subscription lifecycle (this
-- function's WHERE clause vs. get_current_subscription_status's own
-- definition of "still entitled") found this function's UPDATE only ever
-- matched status = 'active'. But google-play-webhook's SUBSCRIPTION_ON_HOLD/
-- IN_GRACE_PERIOD handling and apple-app-store-webhook's DID_FAIL_TO_RENEW
-- grace-period handling both move a row to status = 'payment_pending' BEFORE
-- the platform's final SUBSCRIPTION_EXPIRED/SUBSCRIPTION_REVOKED (Google) or
-- GRACE_PERIOD_EXPIRED (Apple) notification arrives and calls this function -
-- so the real-time downgrade silently matched zero rows for anyone who'd
-- passed through a grace period first. The user was never wrongly left
-- premium forever (get_current_subscription_status's own lazy check and the
-- hourly subscription-checker cron both independently catch and correct a
-- stale payment_pending row once its expires_at has passed), but the raw
-- user_subscriptions row - what admin tooling and revenue reporting read
-- directly - could lag the real outcome by up to an hour. Matching the same
-- status set get_current_subscription_status already treats as "still
-- entitled, therefore correctly flippable to failed" closes that gap.
CREATE OR REPLACE FUNCTION public.handle_payment_failure(p_user_id uuid, p_reason text DEFAULT 'Payment failed'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: can only report your own payment failure';
  END IF;

  -- Update subscription to failed status and downgrade to free
  UPDATE public.user_subscriptions
  SET
    status = 'payment_failed',
    plan_name = 'free',
    updated_at = NOW()
  WHERE
    user_id = p_user_id
    AND status IN ('active', 'cancelled', 'payment_pending');

  -- Log the failure reason
  INSERT INTO public.admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    '00000000-0000-0000-0000-000000000000', -- System user
    'payment_failure',
    p_user_id,
    json_build_object('reason', p_reason, 'timestamp', NOW())
  );

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$function$;

-- The remaining three had no legitimate caller anywhere in the app or edge
-- functions at all (confirmed by grep across src/ and supabase/functions/):
--
-- - handle_subscription_payment: dead code from a retired direct
--   Flutterwave/MoMo integration (references flutterwave_transaction_id,
--   hardcodes country='GH') that the current Paystack-based flow replaced.
--   It would grant free premium to any caller-supplied user id with zero
--   payment verification - in practice the protect_subscription_entitlement
--   trigger already blocks the resulting premium INSERT/UPDATE for any
--   non-admin/non-service-role caller, but it should never have been
--   reachable by anon/authenticated in the first place.
-- - record_premium_subscription: only ever called internally, from the
--   trigger_record_premium() trigger on user_subscriptions - direct calls
--   from outside just let anyone inflate another user's historical
--   premium-subscription-count stat.
-- - test_subscription_info: unused debug/test leftover, not called from
--   anywhere in the app; it leaks any user's subscription plan/status to
--   any caller who supplies their id.
--
-- None of these need to be callable by anon or authenticated - only by the
-- trusted service role (edge functions) or internally by other functions,
-- both of which are unaffected by revoking these two roles' grants.
REVOKE EXECUTE ON FUNCTION public.handle_subscription_payment(uuid, text, numeric, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_premium_subscription(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.test_subscription_info(uuid) FROM anon, authenticated;

-- The 'subscription-checker-hourly' cron job already sets
-- timeout_milliseconds:=30000 on its net.http_post call, specifically
-- because it was found earlier this session that a loop making several
-- sequential external API calls easily exceeds pg_net's 5-second default,
-- getting the connection cut before the edge function finishes writing its
-- results. 'paystack-recurring-billing' loops over every subscription due
-- that hour making a live Paystack charge_authorization call per user
-- (plus one exchange-rate lookup up front) - the exact same shape of loop -
-- but its own cron entry never got the same fix. Worst case here is worse
-- than a stale read: Paystack can successfully charge the customer's card
-- while our own connection gets cut before recording it, leaving a real
-- charge with no matching subscription renewal in our database.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'paystack-recurring-billing'),
  command := $cron$
  SELECT
    net.http_post(
      url:='https://tgjsyyihabsovironesw.supabase.co/functions/v1/paystack-recurring-billing',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT value FROM public.internal_secrets WHERE key = 'paystack_billing_cron_secret')
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=30000
    ) as request_id;
  $cron$
);
