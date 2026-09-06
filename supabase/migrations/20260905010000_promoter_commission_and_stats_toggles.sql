-- Lets an admin control, per promo code:
--   1. commission_enabled  - whether this promoter earns/sees percentage-based
--      commission at all. Some promoters just want their code tracked for
--      leads/subscribers with no payout arrangement; others are on a real
--      commission deal. When off, process_referral_commission stops accruing
--      commission for this code and the portal hides every money-related
--      section (commission rate, earnings, payout request).
--   2. show_stats_enabled - whether the promoter can see their own signups/
--      subscribers/referred-user list in their portal at all. Leads are
--      always tracked server-side (the admin dashboard always sees them)
--      regardless of this flag - it only controls what the promoter sees.
-- Both default to true so every existing promo code keeps behaving exactly as
-- it does today; an admin opts specific promoters out going forward.

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS commission_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_stats_enabled boolean NOT NULL DEFAULT true;

-- ============================================================================
-- influencer_login: surface the two new flags so the portal knows what to
-- show. Everything else is unchanged from the 20260825155724 version.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.influencer_login(code_input text, password_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_promo_code RECORD;
  v_password_ok boolean;
  v_stats json;
BEGIN
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(code_input)
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;

  IF v_promo_code.password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;

  IF v_promo_code.password_hash LIKE '$2%' THEN
    v_password_ok := (extensions.crypt(password_input, v_promo_code.password_hash) = v_promo_code.password_hash);
  ELSE
    v_password_ok := (v_promo_code.password_hash = password_input);
    IF v_password_ok THEN
      UPDATE public.promo_codes
      SET password_hash = extensions.crypt(password_input, extensions.gen_salt('bf'))
      WHERE id = v_promo_code.id;
    END IF;
  END IF;

  IF NOT v_password_ok THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;

  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;

  v_stats := public.get_influencer_full_stats(v_promo_code.id);

  RETURN json_build_object(
    'success', true,
    'promo_code_id', v_promo_code.id,
    'code', v_promo_code.code,
    'owner_name', v_promo_code.owner_name,
    'email', v_promo_code.email,
    'percentage_cut', v_promo_code.percentage_cut,
    'commission_duration', COALESCE(v_promo_code.commission_duration, 12),
    'commission_enabled', v_promo_code.commission_enabled,
    'show_stats_enabled', v_promo_code.show_stats_enabled,
    'status', COALESCE(v_promo_code.status, 'active'),
    'total_signups', v_stats->'total_signups',
    'total_subscribers', v_stats->'total_subscribers',
    'total_commission', v_stats->'total_commission_ghs',
    'total_commission_usd', v_stats->'total_commission_usd',
    'total_commission_ghs_raw', v_stats->'total_commission_ghs',
    'total_paid_ghs', v_stats->'total_paid_ghs',
    'total_paid_usd', v_stats->'total_paid_usd',
    'outstanding_ghs', v_stats->'outstanding_ghs',
    'outstanding_usd', v_stats->'outstanding_usd',
    'has_pending_payout', v_stats->'has_pending_payout',
    'exchange_rate', v_stats->'exchange_rate'
  );
END;
$function$;

-- ============================================================================
-- process_referral_commission: stop accruing commission for promo codes an
-- admin has switched off (leads/subscribers are still tracked separately via
-- the create_referral_on_signup trigger and the subscription itself - only
-- the money side is gated here).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_referral_commission(
  p_user_id uuid,
  p_payment_amount numeric,
  p_payment_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  referral_record RECORD;
  promo_record RECORD;
  deduction_record RECORD;
  commission_amount numeric;
BEGIN
  SELECT * INTO referral_record
  FROM public.referrals WHERE user_id = p_user_id LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('processed', false, 'reason', 'No referral found');
  END IF;

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

  IF NOT promo_record.commission_enabled THEN
    RETURN json_build_object('processed', false, 'reason', 'Commission disabled for this promo code');
  END IF;

  INSERT INTO public.user_referral_deductions (user_id, promo_code_id, deductions_used)
  VALUES (p_user_id, promo_record.id, 0)
  ON CONFLICT (user_id, promo_code_id) DO NOTHING;

  SELECT * INTO deduction_record
  FROM public.user_referral_deductions
  WHERE user_id = p_user_id AND promo_code_id = promo_record.id;

  IF deduction_record.deductions_used >= promo_record.commission_duration THEN
    RETURN json_build_object('processed', false, 'reason', 'Commission limit reached for this user');
  END IF;

  commission_amount := p_payment_amount * (promo_record.percentage_cut / 100);

  INSERT INTO public.influencer_commissions (
    promo_code_id, payment_id, user_id, payment_amount,
    commission_percentage, commission_amount, deduction_number
  ) VALUES (
    promo_record.id, p_payment_id, p_user_id, p_payment_amount,
    promo_record.percentage_cut, commission_amount, deduction_record.deductions_used + 1
  );

  UPDATE public.user_referral_deductions
  SET deductions_used = deductions_used + 1, updated_at = now()
  WHERE user_id = p_user_id AND promo_code_id = promo_record.id;

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
$function$;
