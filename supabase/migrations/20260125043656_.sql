-- Update influencer_login function to fetch dynamic exchange rate from payment_config
-- instead of using hardcoded 16.0 rate

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
  v_exchange_rate numeric;
  v_payment_config RECORD;
BEGIN
  -- Fetch dynamic exchange rate from payment_config
  -- Default to 16.0 if not found or API-based rate not available
  SELECT * INTO v_payment_config
  FROM public.payment_config
  LIMIT 1;
  
  -- Use 16.0 as fallback if no config found
  v_exchange_rate := 16.0;
  
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
  
  -- Convert to USD using dynamic rate (will be updated by frontend with real API rate)
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
    'total_commission_ghs_raw', v_total_commission_ghs,
    'has_pending_payout', v_has_pending_payout
  );
END;
$function$;

-- Create email_broadcast_history table to log email campaigns
CREATE TABLE IF NOT EXISTS public.email_broadcast_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES public.profiles(id),
  subject text NOT NULL,
  message text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  successful_sends integer NOT NULL DEFAULT 0,
  failed_sends integer NOT NULL DEFAULT 0,
  target_countries text[] DEFAULT '{}',
  recipient_filter text DEFAULT 'all',
  status text NOT NULL DEFAULT 'completed',
  error_details jsonb DEFAULT '[]',
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_broadcast_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_broadcast_history
CREATE POLICY "Admins can view email broadcast history"
  ON public.email_broadcast_history
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

CREATE POLICY "Admins can insert email broadcast history"
  ON public.email_broadcast_history
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

CREATE POLICY "Service role full access on email_broadcast_history"
  ON public.email_broadcast_history
  FOR ALL
  USING (true)
  WITH CHECK (true);;
