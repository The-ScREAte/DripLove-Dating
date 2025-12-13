-- Add video support to ads table
ALTER TABLE public.ads
ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
ADD COLUMN IF NOT EXISTS video_url text NULL;

-- Add check constraint for media_type
ALTER TABLE public.ads
ADD CONSTRAINT ads_media_type_check CHECK (media_type IN ('image', 'video'));