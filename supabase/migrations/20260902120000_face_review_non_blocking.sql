-- Photo moderation policy change: default-to-live instead of default-to-review.
-- moderate-image (see supabase/functions/moderate-image) now only ever hides
-- a photo (moderation_status='rejected') for confirmed explicit content.
-- Everything else goes live immediately (moderation_status='approved'), and
-- a face that doesn't clearly match the uploader's verified face just gets a
-- moderation_reason of 'face_weak_match'/'face_no_match'/'moderation_check_failed'
-- on an otherwise-live row - a non-blocking marker for a human to glance at,
-- not something that hides the photo.
--
-- Admins need a way to clear that marker once they've glanced at it and it's
-- fine, without touching is_approved/moderation_status (which authenticated
-- users - including admins, who use the same DB role - can no longer write
-- directly per the grants added in 20260902090100). approve_image/reject_image
-- already use this SECURITY DEFINER pattern for the same reason.
CREATE OR REPLACE FUNCTION public.clear_face_review(image_id uuid, admin_notes text DEFAULT NULL::text)
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

  UPDATE public.user_images
  SET
    moderation_reason = NULL,
    moderation_notes = COALESCE(admin_notes, 'Reviewed by admin - no issue found'),
    moderated_by = auth.uid(),
    moderated_at = now()
  WHERE id = image_id
    AND moderation_status = 'approved';

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.clear_face_review TO authenticated;
