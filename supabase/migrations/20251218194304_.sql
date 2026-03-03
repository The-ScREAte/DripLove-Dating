-- Add target_countries column to ads table for country filtering
ALTER TABLE public.ads
ADD COLUMN IF NOT EXISTS target_countries text[] DEFAULT '{}'::text[];

-- Add comment explaining the column
COMMENT ON COLUMN public.ads.target_countries IS 'Countries where this ad should be shown. Empty array means all countries.';;
