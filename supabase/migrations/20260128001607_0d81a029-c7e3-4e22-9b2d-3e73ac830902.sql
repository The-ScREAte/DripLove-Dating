-- Preserve influencer data when users delete their accounts
-- Change foreign keys to SET NULL instead of CASCADE

-- 1. Alter referrals table - make user_id nullable and change FK behavior
ALTER TABLE public.referrals 
ALTER COLUMN user_id DROP NOT NULL;

-- Drop and recreate FK with ON DELETE SET NULL
ALTER TABLE public.referrals 
DROP CONSTRAINT IF EXISTS referrals_user_id_fkey;

ALTER TABLE public.referrals 
ADD CONSTRAINT referrals_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Drop the unique constraint on user_id since it can now be NULL (and we want to keep records)
ALTER TABLE public.referrals 
DROP CONSTRAINT IF EXISTS referrals_user_id_key;

-- 2. Alter influencer_commissions table - make user_id nullable and change FK behavior
ALTER TABLE public.influencer_commissions 
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.influencer_commissions 
DROP CONSTRAINT IF EXISTS influencer_commissions_user_id_fkey;

ALTER TABLE public.influencer_commissions 
ADD CONSTRAINT influencer_commissions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Alter user_referral_deductions table - make user_id nullable and change FK behavior
ALTER TABLE public.user_referral_deductions 
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.user_referral_deductions 
DROP CONSTRAINT IF EXISTS user_referral_deductions_user_id_fkey;

ALTER TABLE public.user_referral_deductions 
ADD CONSTRAINT user_referral_deductions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Update influencer_login to count signups correctly (including deleted users)
CREATE OR REPLACE FUNCTION public.influencer_login(code_input text, password_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_promo_code RECORD;
  v_total_signups int;
  v_total_subscribers int;
  v_total_commission_ghs numeric;
  v_total_commission_usd numeric;
  v_has_pending_payout boolean;
  v_exchange_rate numeric;
BEGIN
  v_exchange_rate := 16.0;
  
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(code_input)
    AND deleted_at IS NULL;
  
  IF v_promo_code.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;
  
  IF v_promo_code.password_hash IS NULL OR v_promo_code.password_hash != password_input THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;
  
  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;
  
  -- Count ALL referrals (including deleted users where user_id is now NULL)
  SELECT COUNT(*) INTO v_total_signups
  FROM public.referrals
  WHERE promo_code_id = v_promo_code.id;
  
  -- Count active premium subscribers (only existing users)
  SELECT COUNT(DISTINCT r.user_id) INTO v_total_subscribers
  FROM public.referrals r
  INNER JOIN public.user_subscriptions us ON us.user_id = r.user_id
  WHERE r.promo_code_id = v_promo_code.id
    AND r.user_id IS NOT NULL
    AND us.plan_name = 'premium'
    AND us.status IN ('active', 'cancelled')
    AND (us.expires_at IS NULL OR us.expires_at > NOW());
  
  -- Get total commission earned (ALL commissions, including from deleted users)
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission_ghs
  FROM public.influencer_commissions
  WHERE promo_code_id = v_promo_code.id;
  
  v_total_commission_usd := ROUND(v_total_commission_ghs / v_exchange_rate, 2);
  
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
    'total_commission_ghs_raw', v_total_commission_ghs,
    'has_pending_payout', v_has_pending_payout
  );
END;
$$;