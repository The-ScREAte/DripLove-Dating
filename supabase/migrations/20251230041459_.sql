-- Create app_settings table for global application settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read app settings
CREATE POLICY "App settings are publicly readable" 
ON public.app_settings 
FOR SELECT 
USING (true);

-- Only admins can modify app settings
CREATE POLICY "Only admins can modify app settings" 
ON public.app_settings 
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Insert default promo code visibility setting (disabled by default for Apple compliance)
INSERT INTO public.app_settings (id, value) 
VALUES ('promo_code_enabled', '{"enabled": false}'::jsonb)
ON CONFLICT (id) DO NOTHING;;
