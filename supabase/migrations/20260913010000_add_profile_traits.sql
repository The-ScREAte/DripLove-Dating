-- Adds the new profile trait fields: languages, family plans, communication
-- style, love style, pets, and social media habits.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS family_plans text,
  ADD COLUMN IF NOT EXISTS communication_style text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS love_style text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS pets text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS social_media text;
