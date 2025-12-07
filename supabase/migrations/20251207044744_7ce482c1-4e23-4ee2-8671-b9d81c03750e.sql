-- Create promo_codes table
CREATE TABLE public.promo_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  percentage_cut NUMERIC NOT NULL DEFAULT 20 CHECK (percentage_cut >= 0 AND percentage_cut <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add promo_code_used column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS promo_code_used TEXT;

-- Enable RLS on promo_codes
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for promo_codes
CREATE POLICY "Admins can manage promo codes" 
ON public.promo_codes 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE profiles.id = auth.uid() AND profiles.is_admin = true
));

CREATE POLICY "Anyone can view active promo codes" 
ON public.promo_codes 
FOR SELECT 
USING (is_active = true);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_promo_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER update_promo_codes_updated_at
BEFORE UPDATE ON public.promo_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_promo_codes_updated_at();

-- Create index for faster lookups
CREATE INDEX idx_promo_codes_code ON public.promo_codes(code);
CREATE INDEX idx_profiles_promo_code_used ON public.profiles(promo_code_used);