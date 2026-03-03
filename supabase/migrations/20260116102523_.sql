-- Add is_active column to ads table with default true
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Update the "Anyone can view ads" policy to only show active ads
DROP POLICY IF EXISTS "Anyone can view ads" ON public.ads;
CREATE POLICY "Anyone can view active ads" ON public.ads
FOR SELECT
USING (is_active = true OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
));;
