-- approve_image() flipped is_approved/moderation_status to approved but left
-- moderation_reason untouched and never restored image_order from -1. That's
-- harmless for a genuinely pending/flagged photo (moderation_reason is
-- already null, image_order was already a real slot), but overriding a
-- REJECTED photo (moderation_reason='explicit_content', image_order=-1 from
-- moderate-image's own auto-reject) left it in a zombie state: flagged
-- "approved" in the DB, yet still matched by the admin panel's own
-- "Needs a Glance" query (moderation_status='approved' AND moderation_reason
-- IS NOT NULL - see ImageModerationPanel.tsx fetchFaceReviewImages), so it
-- kept reappearing for review no matter how many times an admin approved it.
-- It also never became visible on the user's actual profile, since nothing
-- ever moved image_order off -1.
--
-- Fix: approving always clears moderation_reason (this function IS the
-- resolution - nothing should remain outstanding afterward, same principle
-- clear_face_review already applies), and restores a real image_order when
-- the photo was previously hidden (-1), picking the first free slot (1-7)
-- for that user so the approved photo actually becomes visible again.
CREATE OR REPLACE FUNCTION public.approve_image(image_id uuid, admin_notes text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_image_order integer;
  v_next_order integer;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT user_id, image_order INTO v_user_id, v_image_order
  FROM public.user_images
  WHERE id = image_id;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_next_order := v_image_order;
  IF v_image_order IS NULL OR v_image_order < 1 THEN
    -- Photo was hidden (rejected or never got a real slot) - find the
    -- first free slot (1-7) for this user so approving actually makes it
    -- visible again, same numbering scheme the upload flow itself uses.
    SELECT MIN(slot) INTO v_next_order
    FROM generate_series(1, 7) AS slot
    WHERE slot NOT IN (
      SELECT image_order FROM public.user_images
      WHERE user_id = v_user_id AND image_order >= 1 AND id != image_id
    );
  END IF;

  UPDATE public.user_images
  SET
    is_approved = true,
    moderation_status = 'approved',
    moderation_reason = NULL,
    moderation_notes = admin_notes,
    moderated_by = auth.uid(),
    moderated_at = now(),
    image_order = COALESCE(v_next_order, v_image_order)
  WHERE id = image_id;

  RETURN true;
END;
$function$;
