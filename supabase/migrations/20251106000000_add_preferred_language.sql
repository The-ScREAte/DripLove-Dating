-- Add preferred_language column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en';

-- Add comment to the column
COMMENT ON COLUMN public.profiles.preferred_language IS 'User''s preferred language for the app interface (en, fr, de, zh, sw, pt, ar)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language ON public.profiles(preferred_language);
