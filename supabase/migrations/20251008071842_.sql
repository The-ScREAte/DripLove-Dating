-- Add adinkra_symbols column to profiles table
ALTER TABLE public.profiles
ADD COLUMN adinkra_symbols text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.adinkra_symbols IS 'User selected Adinkra symbols (optional, max 10)';;
