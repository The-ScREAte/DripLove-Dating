-- Function to activate promo code after password is set
CREATE OR REPLACE FUNCTION public.activate_promo_code_after_password(
  p_promo_code_id uuid,
  p_token text,
  p_new_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  promo_record RECORD;
BEGIN
  -- Verify token matches and get promo code
  SELECT * INTO promo_record
  FROM public.promo_codes
  WHERE id = p_promo_code_id
  AND password_hash = p_token
  AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code or token');
  END IF;

  -- Update password and activate
  UPDATE public.promo_codes
  SET password_hash = p_new_password,
      status = 'active',
      updated_at = now()
  WHERE id = p_promo_code_id;

  RETURN json_build_object('success', true, 'message', 'Password set and promo code activated');
END;
$$;

-- Also create a function to manually activate a promo code (for admin use or fixing existing ones)
CREATE OR REPLACE FUNCTION public.manual_activate_promo_code(
  p_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.promo_codes
  SET status = 'active',
      updated_at = now()
  WHERE LOWER(code) = LOWER(p_code)
  AND deleted_at IS NULL;

  IF FOUND THEN
    RETURN json_build_object('success', true, 'message', 'Promo code activated');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Promo code not found');
  END IF;
END;
$$;
