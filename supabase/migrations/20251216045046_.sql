-- Add email column to promo_codes for influencer contact
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS email text;

-- Update the influencer_login function to return email
CREATE OR REPLACE FUNCTION public.influencer_login(code_input text, password_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo_code promo_codes%ROWTYPE;
  v_total_signups int;
  v_total_subscribers int;
  v_total_commission numeric;
  v_has_pending_payout boolean;
BEGIN
  -- Find promo code (case-insensitive)
  SELECT * INTO v_promo_code
  FROM promo_codes
  WHERE UPPER(code) = UPPER(code_input)
    AND deleted_at IS NULL;
  
  IF v_promo_code.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;
  
  -- Check password (simple comparison - password stored as plain text for now)
  IF v_promo_code.password_hash IS NULL OR v_promo_code.password_hash != password_input THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;
  
  -- Check if blocked
  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;
  
  -- Get total signups
  SELECT COUNT(*) INTO v_total_signups
  FROM referrals
  WHERE promo_code_id = v_promo_code.id;
  
  -- Get total premium subscribers
  SELECT COUNT(DISTINCT r.user_id) INTO v_total_subscribers
  FROM referrals r
  INNER JOIN user_subscriptions us ON us.user_id = r.user_id
  WHERE r.promo_code_id = v_promo_code.id
    AND us.plan_name = 'premium'
    AND us.status = 'active';
  
  -- Get total commission earned
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission
  FROM influencer_commissions
  WHERE promo_code_id = v_promo_code.id;
  
  -- Check for pending payout
  SELECT EXISTS(
    SELECT 1 FROM payout_requests
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
    'commission_duration', v_promo_code.commission_duration,
    'status', v_promo_code.status,
    'total_signups', v_total_signups,
    'total_subscribers', v_total_subscribers,
    'total_commission', v_total_commission,
    'has_pending_payout', v_has_pending_payout
  );
END;
$$;;
