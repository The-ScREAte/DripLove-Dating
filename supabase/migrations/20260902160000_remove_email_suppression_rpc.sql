-- Lets an admin manually un-suppress an address from the admin panel (e.g. it
-- was fixed, or got suppressed by a mistaken bounce classification), without
-- granting the client a blanket DELETE policy on email_suppression_list -
-- same SECURITY DEFINER + is_admin-check pattern already used by
-- approve_image/reject_image/clear_face_review.
CREATE OR REPLACE FUNCTION public.remove_email_suppression(target_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  DELETE FROM public.email_suppression_list WHERE email = target_email;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_email_suppression TO authenticated;
