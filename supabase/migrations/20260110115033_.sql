-- Trigger to update promo_codes.total_signups when referral is inserted
CREATE OR REPLACE FUNCTION public.update_promo_code_signups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Increment total_signups for the promo code
  UPDATE public.promo_codes
  SET total_signups = COALESCE(total_signups, 0) + 1,
      updated_at = now()
  WHERE id = NEW.promo_code_id;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on referrals table
DROP TRIGGER IF EXISTS trigger_update_promo_code_signups ON public.referrals;
CREATE TRIGGER trigger_update_promo_code_signups
AFTER INSERT ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.update_promo_code_signups();

-- Create function to get influencer stats with USD conversion
-- Fixed exchange rates (approximate, update as needed)
CREATE OR REPLACE FUNCTION public.get_influencer_stats_usd(p_promo_code_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_total_signups int;
  v_total_subscribers int;
  v_total_commission_ghs numeric;
  v_total_commission_usd numeric;
  v_exchange_rate numeric := 16.0; -- GHS to USD rate (update periodically)
BEGIN
  -- Get total signups
  SELECT COUNT(*) INTO v_total_signups
  FROM public.referrals
  WHERE promo_code_id = p_promo_code_id;
  
  -- Get total premium subscribers (both active and cancelled but not expired)
  SELECT COUNT(DISTINCT r.user_id) INTO v_total_subscribers
  FROM public.referrals r
  INNER JOIN public.user_subscriptions us ON us.user_id = r.user_id
  WHERE r.promo_code_id = p_promo_code_id
    AND us.plan_name = 'premium'
    AND us.status IN ('active', 'cancelled')
    AND (us.expires_at IS NULL OR us.expires_at > NOW());
  
  -- Get total commission earned (already stored in payment currency)
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission_ghs
  FROM public.influencer_commissions
  WHERE promo_code_id = p_promo_code_id;
  
  -- Convert to USD (for now, assume all in GHS)
  v_total_commission_usd := ROUND(v_total_commission_ghs / v_exchange_rate, 2);
  
  RETURN json_build_object(
    'total_signups', v_total_signups,
    'total_subscribers', v_total_subscribers,
    'total_commission_ghs', ROUND(v_total_commission_ghs, 2),
    'total_commission_usd', v_total_commission_usd
  );
END;
$function$;

-- Update influencer_login to include USD amount
CREATE OR REPLACE FUNCTION public.influencer_login(code_input text, password_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_promo_code RECORD;
  v_total_signups int;
  v_total_subscribers int;
  v_total_commission_ghs numeric;
  v_total_commission_usd numeric;
  v_has_pending_payout boolean;
  v_exchange_rate numeric := 16.0;
BEGIN
  -- Find promo code (case-insensitive)
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(code_input)
    AND deleted_at IS NULL;
  
  IF v_promo_code.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;
  
  -- Check password
  IF v_promo_code.password_hash IS NULL OR v_promo_code.password_hash != password_input THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;
  
  -- Check if blocked
  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;
  
  -- Get total signups
  SELECT COUNT(*) INTO v_total_signups
  FROM public.referrals
  WHERE promo_code_id = v_promo_code.id;
  
  -- Get total premium subscribers (active or cancelled but not expired)
  SELECT COUNT(DISTINCT r.user_id) INTO v_total_subscribers
  FROM public.referrals r
  INNER JOIN public.user_subscriptions us ON us.user_id = r.user_id
  WHERE r.promo_code_id = v_promo_code.id
    AND us.plan_name = 'premium'
    AND us.status IN ('active', 'cancelled')
    AND (us.expires_at IS NULL OR us.expires_at > NOW());
  
  -- Get total commission earned
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission_ghs
  FROM public.influencer_commissions
  WHERE promo_code_id = v_promo_code.id;
  
  -- Convert to USD
  v_total_commission_usd := ROUND(v_total_commission_ghs / v_exchange_rate, 2);
  
  -- Check for pending payout
  SELECT EXISTS(
    SELECT 1 FROM public.payout_requests
    WHERE promo_code_id = v_promo_code.id
      AND status = 'pending'
  ) INTO v_has_pending_payout;
  
  RETURN json_build_object(
    'success', true,
    'promo_code_id', v_promo_code.id,
    'code', v_promo_code.code,
    'owner_name', v_promo_code.owner_name,
    'email', v_promo_code.email,
    'percentage_cut', v_promo_code.percentage_cut,
    'commission_duration', COALESCE(v_promo_code.commission_duration, 12),
    'status', COALESCE(v_promo_code.status, 'active'),
    'total_signups', v_total_signups,
    'total_subscribers', v_total_subscribers,
    'total_commission', v_total_commission_ghs,
    'total_commission_usd', v_total_commission_usd,
    'has_pending_payout', v_has_pending_payout
  );
END;
$function$;;
