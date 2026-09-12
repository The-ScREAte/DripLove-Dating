-- Lets a user optionally attach a preset "label" (e.g. "Me at work") and a
-- short free-text "caption" to one of their own photos, edited from the
-- photo preview overlay in ImageManagement.tsx. Both nullable/optional -
-- most photos will have neither. The existing "users can update their own
-- images" RLS policy and the public SELECT policy on user_images already
-- cover these two columns - RLS is necessary but not sufficient, though:
-- this table grants UPDATE per-column (not table-wide) to `authenticated`,
-- so a brand new column needs its own explicit GRANT too, or every save
-- fails at the privilege check before RLS is even evaluated.
ALTER TABLE public.user_images
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS caption text;

GRANT UPDATE (label, caption) ON public.user_images TO authenticated;

NOTIFY pgrst, 'reload schema';
