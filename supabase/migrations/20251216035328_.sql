-- Extend promo_codes table with additional fields for influencer system
ALTER TABLE public.promo_codes 
ADD COLUMN IF NOT EXISTS password_hash text,
ADD COLUMN IF NOT EXISTS commission_duration integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS total_signups integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid_subscribers integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_commission_earned numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- Create referrals table to track user signups with promo codes
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id)
);

-- Create subscription_payments table to track payments with price snapshots
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.user_subscriptions(id),
  amount numeric NOT NULL,
  currency text DEFAULT 'GHS',
  payment_method text,
  transaction_id text,
  promo_code_id uuid REFERENCES public.promo_codes(id),
  created_at timestamp with time zone DEFAULT now()
);

-- Create influencer_commissions table to track commission per payment
CREATE TABLE IF NOT EXISTS public.influencer_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.subscription_payments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_amount numeric NOT NULL,
  commission_percentage numeric NOT NULL,
  commission_amount numeric NOT NULL,
  deduction_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

-- Create user_referral_deductions table to track remaining deductions per user
CREATE TABLE IF NOT EXISTS public.user_referral_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  deductions_used integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, promo_code_id)
);

-- Create payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  status text DEFAULT 'pending',
  admin_notes text,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_referral_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for referrals
CREATE POLICY "Users can view their own referral" ON public.referrals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own referral" ON public.referrals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all referrals" ON public.referrals
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- RLS policies for subscription_payments
CREATE POLICY "Users can view their own payments" ON public.subscription_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert payments" ON public.subscription_payments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all payments" ON public.subscription_payments
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- RLS policies for influencer_commissions
CREATE POLICY "Admins can manage commissions" ON public.influencer_commissions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- RLS policies for user_referral_deductions
CREATE POLICY "Users can view their own deductions" ON public.user_referral_deductions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage deductions" ON public.user_referral_deductions
  FOR ALL USING (true);

-- RLS policies for payout_requests
CREATE POLICY "Admins can manage payout requests" ON public.payout_requests
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- Function to validate promo code
CREATE OR REPLACE FUNCTION public.validate_promo_code(code_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  promo_record RECORD;
BEGIN
  SELECT * INTO promo_record
  FROM public.promo_codes
  WHERE LOWER(code) = LOWER(code_input)
  AND is_active = true
  AND status = 'active'
  AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid or inactive promo code');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'promo_code_id', promo_record.id,
    'code', promo_record.code,
    'owner_name', promo_record.owner_name
  );
END;
$$;

-- Function for influencer login
CREATE OR REPLACE FUNCTION public.influencer_login(code_input text, password_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  promo_record RECORD;
  referral_count integer;
  subscriber_count integer;
  total_commission numeric;
  pending_payout boolean;
BEGIN
  SELECT * INTO promo_record
  FROM public.promo_codes
  WHERE LOWER(code) = LOWER(code_input)
  AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;

  IF promo_record.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;

  IF promo_record.password_hash IS NULL OR promo_record.password_hash != crypt(password_input, promo_record.password_hash) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;

  -- Get stats
  SELECT COUNT(*) INTO referral_count FROM public.referrals WHERE promo_code_id = promo_record.id;
  
  SELECT COUNT(DISTINCT r.user_id) INTO subscriber_count
  FROM public.referrals r
  JOIN public.user_subscriptions us ON r.user_id = us.user_id
  WHERE r.promo_code_id = promo_record.id
  AND us.plan_name = 'premium'
  AND us.status = 'active';

  SELECT COALESCE(SUM(commission_amount), 0) INTO total_commission
  FROM public.influencer_commissions WHERE promo_code_id = promo_record.id;

  SELECT EXISTS (
    SELECT 1 FROM public.payout_requests 
    WHERE promo_code_id = promo_record.id AND status = 'pending'
  ) INTO pending_payout;

  RETURN json_build_object(
    'success', true,
    'promo_code_id', promo_record.id,
    'code', promo_record.code,
    'owner_name', promo_record.owner_name,
    'percentage_cut', promo_record.percentage_cut,
    'commission_duration', promo_record.commission_duration,
    'status', promo_record.status,
    'total_signups', referral_count,
    'total_subscribers', subscriber_count,
    'total_commission', total_commission,
    'has_pending_payout', pending_payout
  );
END;
$$;

-- Function to process commission on payment
CREATE OR REPLACE FUNCTION public.process_referral_commission(
  p_user_id uuid,
  p_payment_amount numeric,
  p_payment_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  referral_record RECORD;
  promo_record RECORD;
  deduction_record RECORD;
  commission_amount numeric;
BEGIN
  -- Check if user has a referral
  SELECT * INTO referral_record
  FROM public.referrals WHERE user_id = p_user_id LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('processed', false, 'reason', 'No referral found');
  END IF;

  -- Get promo code details
  SELECT * INTO promo_record
  FROM public.promo_codes 
  WHERE id = referral_record.promo_code_id
  AND is_active = true
  AND status = 'active'
  AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('processed', false, 'reason', 'Promo code inactive or blocked');
  END IF;

  -- Get or create deduction record
  INSERT INTO public.user_referral_deductions (user_id, promo_code_id, deductions_used)
  VALUES (p_user_id, promo_record.id, 0)
  ON CONFLICT (user_id, promo_code_id) DO NOTHING;

  SELECT * INTO deduction_record
  FROM public.user_referral_deductions
  WHERE user_id = p_user_id AND promo_code_id = promo_record.id;

  -- Check if deduction limit reached
  IF deduction_record.deductions_used >= promo_record.commission_duration THEN
    RETURN json_build_object('processed', false, 'reason', 'Commission limit reached for this user');
  END IF;

  -- Calculate commission
  commission_amount := p_payment_amount * (promo_record.percentage_cut / 100);

  -- Record commission
  INSERT INTO public.influencer_commissions (
    promo_code_id, payment_id, user_id, payment_amount, 
    commission_percentage, commission_amount, deduction_number
  ) VALUES (
    promo_record.id, p_payment_id, p_user_id, p_payment_amount,
    promo_record.percentage_cut, commission_amount, deduction_record.deductions_used + 1
  );

  -- Update deduction count
  UPDATE public.user_referral_deductions
  SET deductions_used = deductions_used + 1, updated_at = now()
  WHERE user_id = p_user_id AND promo_code_id = promo_record.id;

  -- Update promo code stats
  UPDATE public.promo_codes
  SET total_commission_earned = COALESCE(total_commission_earned, 0) + commission_amount,
      updated_at = now()
  WHERE id = promo_record.id;

  RETURN json_build_object(
    'processed', true,
    'commission_amount', commission_amount,
    'deduction_number', deduction_record.deductions_used + 1
  );
END;
$$;

-- Function for influencer to request payout
CREATE OR REPLACE FUNCTION public.request_influencer_payout(
  p_promo_code_id uuid,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  pending_exists boolean;
BEGIN
  -- Check for existing pending payout
  SELECT EXISTS (
    SELECT 1 FROM public.payout_requests 
    WHERE promo_code_id = p_promo_code_id AND status = 'pending'
  ) INTO pending_exists;

  IF pending_exists THEN
    RETURN json_build_object('success', false, 'error', 'You already have a pending payout request');
  END IF;

  INSERT INTO public.payout_requests (promo_code_id, amount, status)
  VALUES (p_promo_code_id, p_amount, 'pending');

  RETURN json_build_object('success', true, 'message', 'Payout request submitted');
END;
$$;;
