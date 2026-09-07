-- Adds an optional height field (in centimeters) to profiles, so it can be
-- edited in Basic Info and surfaced in the profile basics chip row.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height_cm integer;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_height_cm_range
  CHECK (height_cm IS NULL OR (height_cm BETWEEN 100 AND 250));
