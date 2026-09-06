-- The password-setup link is shown to the admin exactly once, right after
-- creating a promoter, because the setup token lives in promo_codes.password_hash
-- - a column the client can no longer SELECT (revoked in the 20260825155724
-- security fix). If the admin closes that dialog before copying the link,
-- there was previously no way to get it back short of a raw SQL query.
--
-- This RPC lets an admin fetch (or re-issue) a fresh setup link for a promoter
-- at any time - it generates a brand-new token, which invalidates any older
-- unused link (only one setup link is ever valid at once, matching how the
-- create flow already worked).
CREATE OR REPLACE FUNCTION public.admin_get_promo_setup_link(p_promo_code_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token text;
  v_updated_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_token := gen_random_uuid()::text;

  UPDATE public.promo_codes
  SET password_hash = v_token,
      status = 'pending_password',
      updated_at = now()
  WHERE id = p_promo_code_id
    AND deleted_at IS NULL
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Promo code not found');
  END IF;

  RETURN json_build_object('success', true, 'token', v_token);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_promo_setup_link(uuid) TO authenticated;
