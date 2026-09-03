-- Move photo moderation server-side (AWS Rekognition, called from the new
-- moderate-image edge function) and close the client-bypass hole where the
-- browser itself set is_approved/moderation_status on insert/update.
--
-- Previously photoModeration.ts ran fake pixel-color heuristics in the
-- browser and the client wrote the resulting is_approved/moderation_status
-- straight into user_images via the anon/authenticated Supabase client -
-- meaning any user could set is_approved: true on their own row directly,
-- bypassing moderation entirely. Real moderation (AWS Rekognition nudity
-- labels, celebrity recognition, and face-match against the user's verified
-- Rekognition face) now runs only in moderate-image, using the service role.

-- 1. Columns to record what the AI actually found, for admin review and audit.
ALTER TABLE public.user_images ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE public.user_images ADD COLUMN IF NOT EXISTS moderation_labels JSONB;
ALTER TABLE public.user_images ADD COLUMN IF NOT EXISTS face_similarity DOUBLE PRECISION;

-- 2. Rejections must keep an audit trail instead of deleting the row - the
-- previous version of reject_image() (20250714073858 / 20250727051845)
-- deleted the row outright, leaving no record of what was rejected or why.
-- A rejected row must stop occupying an image_order slot though (1-7,
-- unique per user) so the user can upload a replacement - so it's moved to
-- the sentinel order -1, which the two constraints below make legal.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname, contype
    FROM pg_constraint
    WHERE conrelid = 'public.user_images'::regclass
      AND (
        (contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%image_order%')
        OR (contype = 'u' AND pg_get_constraintdef(oid) ILIKE '%image_order%')
      )
  LOOP
    EXECUTE format('ALTER TABLE public.user_images DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_images
  ADD CONSTRAINT user_images_image_order_check
  CHECK (image_order = -1 OR (image_order >= 1 AND image_order <= 7));

-- Partial unique index instead of a table UNIQUE constraint so multiple
-- rejected (-1) rows per user are allowed, while active slots (1-7) still
-- can't collide.
CREATE UNIQUE INDEX IF NOT EXISTS user_images_user_id_image_order_active_key
  ON public.user_images (user_id, image_order)
  WHERE image_order > 0;

CREATE OR REPLACE FUNCTION public.reject_image(image_id uuid, admin_notes text DEFAULT NULL::text)
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
    is_approved = false,
    moderation_status = 'rejected',
    moderation_notes = admin_notes,
    moderated_by = auth.uid(),
    moderated_at = now(),
    image_order = -1
  WHERE id = image_id;

  RETURN true;
END;
$function$;

-- 3. Close the client-bypass hole: authenticated users may only ever insert/
-- update the columns that are legitimately theirs to set (the photo itself
-- and its slot). Every moderation column (is_approved, moderation_status,
-- moderation_notes, moderated_by, moderated_at, flagged_content,
-- confidence_score, moderation_reason, moderation_labels, face_similarity)
-- becomes writable only by the service role (moderate-image) or by the
-- SECURITY DEFINER approve_image/reject_image functions, which run as their
-- owner regardless of the caller's grants - so admin approve/reject still
-- works unaffected. PhotoCropModal's own-photo crop (image_url only) and
-- the admin crop tool (image_url via the "Admins can update any user image"
-- RLS policy) both keep working since image_url stays grantable.
REVOKE INSERT ON public.user_images FROM authenticated;
GRANT INSERT (user_id, image_url, image_order) ON public.user_images TO authenticated;

REVOKE UPDATE ON public.user_images FROM authenticated;
GRANT UPDATE (image_url, image_order) ON public.user_images TO authenticated;
