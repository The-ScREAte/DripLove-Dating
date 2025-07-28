-- Add enabled_countries table to store countries that admin allows users to select
CREATE TABLE IF NOT EXISTS public.enabled_countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code VARCHAR(2) NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on enabled_countries table
ALTER TABLE public.enabled_countries ENABLE ROW LEVEL SECURITY;

-- Create policies for enabled_countries
CREATE POLICY "Users can view enabled countries"
ON public.enabled_countries
FOR SELECT
USING (is_enabled = true);

CREATE POLICY "Admins can manage enabled countries"
ON public.enabled_countries
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_admin = true
));

-- Function to get enabled countries for users
CREATE OR REPLACE FUNCTION public.get_enabled_countries()
RETURNS TABLE(country_code VARCHAR, country_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT ec.country_code, ec.country_name
  FROM public.enabled_countries ec
  WHERE ec.is_enabled = true
  ORDER BY ec.country_name;
END;
$$;

-- Insert default enabled countries (all major African countries to start)
INSERT INTO public.enabled_countries (country_code, country_name, is_enabled) VALUES
('GH', 'Ghana', true),
('NG', 'Nigeria', true),
('KE', 'Kenya', true),
('ZA', 'South Africa', true),
('EG', 'Egypt', true),
('MA', 'Morocco', true),
('ET', 'Ethiopia', true),
('TZ', 'Tanzania', true),
('UG', 'Uganda', true),
('SN', 'Senegal', true),
('ZW', 'Zimbabwe', true),
('US', 'United States', true),
('CA', 'Canada', true),
('GB', 'United Kingdom', true)
ON CONFLICT (country_code) DO NOTHING;