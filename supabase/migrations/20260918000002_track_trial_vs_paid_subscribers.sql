-- A referred user on an Apple/Google free trial was being counted the same
-- as a genuinely paying subscriber everywhere (admin promoter dashboard,
-- get_influencer_full_stats, the influencer_login RPC that drives the
-- promoter portal): both just show up as plan_name='premium', status='active'.
-- If the user cancels before the trial converts, no charge ever happens, but
-- the promoter had already been shown (and, before the iap validators were
-- fixed, actually credited) commission for a "paid subscriber" who never
-- generated any revenue.
--
-- is_trial tracks whether the CURRENT active period is a trial/introductory
-- period (no real charge yet) so this can be distinguished as "Pending"
-- rather than "Premium" until the real charge lands (which flips it to
-- false via the DID_RENEW / SUBSCRIPTION_RENEWED webhook handlers).
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

-- Backfill: this app only ever sells a monthly plan (see the product IDs in
-- iap-receipt-validator/google-iap-validator), so any currently-active IAP
-- subscription whose period is far shorter than a month is unambiguously
-- still sitting in its free trial/intro-offer window, never having been
-- charged the full monthly price yet.
UPDATE public.user_subscriptions
SET is_trial = true
WHERE plan_name = 'premium'
  AND status IN ('active', 'cancelled')
  AND payment_method IN ('apple', 'google')
  AND expires_at IS NOT NULL
  AND expires_at > NOW()
  AND expires_at - created_at < interval '10 days';

-- get_influencer_full_stats now reports paying subscribers (total_subscribers,
-- unchanged meaning - is_trial = false) separately from users currently on an
-- uncharged trial (total_trial_users) instead of folding both into one count.
CREATE OR REPLACE FUNCTION public.get_influencer_full_stats(p_promo_code_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_total_signups int;
  v_total_subscribers int;
  v_total_trial_users int;
  v_total_commission_ghs numeric;
  v_total_paid_ghs numeric;
  v_outstanding_ghs numeric;
  v_pending_requests int;
  v_exchange_rate numeric := 16.0; -- GHS per USD, matches the rate used elsewhere
BEGIN
  SELECT COUNT(*) INTO v_total_signups
  FROM public.referrals
  WHERE promo_code_id = p_promo_code_id;

  SELECT COUNT(DISTINCT r.user_id) INTO v_total_subscribers
  FROM public.referrals r
  INNER JOIN public.user_subscriptions us ON us.user_id = r.user_id
  WHERE r.promo_code_id = p_promo_code_id
    AND r.user_id IS NOT NULL
    AND us.plan_name = 'premium'
    AND us.status IN ('active', 'cancelled')
    AND us.is_trial = false
    AND (us.expires_at IS NULL OR us.expires_at > NOW());

  SELECT COUNT(DISTINCT r.user_id) INTO v_total_trial_users
  FROM public.referrals r
  INNER JOIN public.user_subscriptions us ON us.user_id = r.user_id
  WHERE r.promo_code_id = p_promo_code_id
    AND r.user_id IS NOT NULL
    AND us.plan_name = 'premium'
    AND us.status IN ('active', 'cancelled')
    AND us.is_trial = true
    AND (us.expires_at IS NULL OR us.expires_at > NOW());

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission_ghs
  FROM public.influencer_commissions
  WHERE promo_code_id = p_promo_code_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid_ghs
  FROM public.payout_requests
  WHERE promo_code_id = p_promo_code_id AND status = 'completed';

  SELECT COUNT(*) INTO v_pending_requests
  FROM public.payout_requests
  WHERE promo_code_id = p_promo_code_id AND status = 'pending';

  v_outstanding_ghs := GREATEST(v_total_commission_ghs - v_total_paid_ghs, 0);

  RETURN json_build_object(
    'total_signups', v_total_signups,
    'total_subscribers', v_total_subscribers,
    'total_trial_users', v_total_trial_users,
    'total_commission_ghs', ROUND(v_total_commission_ghs, 2),
    'total_commission_usd', ROUND(v_total_commission_ghs / v_exchange_rate, 2),
    'total_paid_ghs', ROUND(v_total_paid_ghs, 2),
    'total_paid_usd', ROUND(v_total_paid_ghs / v_exchange_rate, 2),
    'outstanding_ghs', ROUND(v_outstanding_ghs, 2),
    'outstanding_usd', ROUND(v_outstanding_ghs / v_exchange_rate, 2),
    'pending_requests', v_pending_requests,
    'has_pending_payout', v_pending_requests > 0,
    'exchange_rate', v_exchange_rate
  );
END;
$function$;
