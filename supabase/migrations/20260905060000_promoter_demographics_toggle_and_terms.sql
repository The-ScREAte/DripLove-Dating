-- 1. A dedicated admin toggle for the Lead Demographics breakdown, independent
--    of show_leads_enabled (the plain signup count) - an admin may want to
--    share one without the other. Defaults true so existing promoters keep
--    seeing it (it was unconditional until now).
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS show_demographics_enabled boolean NOT NULL DEFAULT true;

-- 2. Tracks when a promoter accepted the Promoter Program terms - gates a
--    one-time, non-dismissible prompt on first login. NULL = not yet accepted.
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- ============================================================================
-- influencer_login: surface both new fields.
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
    'show_leads_enabled', v_promo_code.show_leads_enabled,
    'show_subscribers_enabled', v_promo_code.show_subscribers_enabled,
    'show_demographics_enabled', v_promo_code.show_demographics_enabled,
    'terms_accepted_at', v_promo_code.terms_accepted_at,
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
-- accept_influencer_terms: self-authenticating, same code+password re-check
-- pattern as request_influencer_payout / get_influencer_referred_users.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_influencer_terms(
  p_code text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_promo_code RECORD;
  v_password_ok boolean;
  v_accepted_at timestamptz;
BEGIN
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(p_code)
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL OR v_promo_code.password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_promo_code.password_hash LIKE '$2%' THEN
    v_password_ok := (extensions.crypt(p_password, v_promo_code.password_hash) = v_promo_code.password_hash);
  ELSE
    v_password_ok := (v_promo_code.password_hash = p_password);
  END IF;

  IF NOT v_password_ok THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  v_accepted_at := COALESCE(v_promo_code.terms_accepted_at, now());

  UPDATE public.promo_codes
  SET terms_accepted_at = v_accepted_at
  WHERE id = v_promo_code.id AND terms_accepted_at IS NULL;

  RETURN json_build_object('success', true, 'terms_accepted_at', v_accepted_at);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_influencer_terms(text, text) TO authenticated, anon;
