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
    AND status = 'active';

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
