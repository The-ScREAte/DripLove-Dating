-- Create table for app update configuration
CREATE TABLE public.app_update_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  current_version text NOT NULL DEFAULT '1.0.0',
  target_platform text NOT NULL DEFAULT 'both', -- 'ios', 'android', or 'both'
  play_store_url text DEFAULT 'https://play.google.com/store/apps/details?id=com.driplove.dating&pcampaignid=web_share',
  app_store_url text DEFAULT 'https://apps.apple.com/us/app/driplove/id6751401155',
  universal_link text DEFAULT 'https://driplove.love/r/o5f15uwE',
  update_message text DEFAULT 'A new version is available! Update now for the best experience.',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.app_update_config ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can manage app update config" 
ON public.app_update_config 
FOR ALL 
USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true ));

-- Create policy for users to read the config
CREATE POLICY "Anyone can read app update config" 
ON public.app_update_config 
FOR SELECT 
USING (true);

-- Insert default config row
INSERT INTO public.app_update_config (id, is_enabled, current_version, target_platform)
VALUES (gen_random_uuid(), false, '1.0.0', 'both');;
