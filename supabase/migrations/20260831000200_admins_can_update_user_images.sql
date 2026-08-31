-- FIX: admin photo-crop tools silently did nothing when cropping another
-- user's photo.
--
-- public.user_images had an UPDATE policy for a user updating their own row
-- ("Users can update their own images", auth.uid() = user_id) and a DELETE
-- policy for admins ("Admins can delete any user image") - but no UPDATE
-- policy for admins. uploadCroppedPhoto() (src/components/profile/
-- PhotoCropModal.tsx) runs its UPDATE user_images ... WHERE user_id = X AND
-- image_url = Y through the admin's own authenticated session, not the
-- service role. RLS silently filters that WHERE clause down to zero visible
-- rows for a row belonging to someone else, and a Postgres UPDATE matching
-- zero rows is not an error - so the crop tool uploaded a new cropped file
-- to storage, got back a "success," and the real user_images row was never
-- repointed at it. Every admin crop entry point (Pending Approval, Reported
-- Images, the user-detail profile modal) hit this identically, since an
-- admin cropping *their own* photo was never the common case.
CREATE POLICY "Admins can update any user image"
ON public.user_images
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);
