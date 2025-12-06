-- Add unlocked_countries column for premium users to see profiles from additional countries
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS unlocked_countries text[] DEFAULT '{}'::text[];

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.unlocked_countries IS 'Premium feature: array of country codes (max 3) where user can see profiles beyond their distance limit';