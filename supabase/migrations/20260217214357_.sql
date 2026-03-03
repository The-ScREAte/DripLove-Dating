
CREATE OR REPLACE FUNCTION public.set_influencer_password(
  p_promo_code_id UUID,
  p_token TEXT,
  p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_promo RECORD;
BEGIN
  -- Validate inputs
  IF p_promo_code_id IS NULL OR p_token IS NULL OR p_new_password IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required fields');
  END IF;

  IF length(p_new_password) < 6 THEN
    RETURN json_build_object('success', false, 'error', 'Password must be at least 6 characters');
  END IF;

  -- Fetch the promo code
  SELECT id, code, owner_name, password_hash, status, is_active, deleted_at
  INTO v_promo
  FROM public.promo_codes
  WHERE id = p_promo_code_id;

  IF v_promo.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Promo code not found');
  END IF;

  -- Only allow setting password if status is pending_password
  -- OR if the token matches the current password_hash (valid setup link)
  IF v_promo.status = 'pending_password' OR v_promo.password_hash = p_token THEN
    UPDATE public.promo_codes
    SET password_hash = p_new_password,
        status = 'active',
        updated_at = NOW()
    WHERE id = p_promo_code_id;

    RETURN json_build_object('success', true);
  END IF;

  -- If already active with a different password, reject
  IF v_promo.status = 'active' AND v_promo.password_hash IS NOT NULL AND v_promo.password_hash != p_token THEN
    RETURN json_build_object('success', false, 'error', 'Password has already been set. Please use the login page.');
  END IF;

  RETURN json_build_object('success', false, 'error', 'Invalid or expired token');
END;
$$;
;
