-- Create payment configuration table for admin settings
CREATE TABLE IF NOT EXISTS public.payment_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  premium_price NUMERIC NOT NULL DEFAULT 50,
  currency TEXT NOT NULL DEFAULT 'GHS',
  payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage payment config
CREATE POLICY "Admins can manage payment config" 
ON public.payment_config 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE id = auth.uid() AND is_admin = true
));

-- Allow all authenticated users to read payment config
CREATE POLICY "Users can read payment config" 
ON public.payment_config 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Insert default payment config
INSERT INTO public.payment_config (premium_price, currency, payment_methods) 
VALUES (50, 'GHS', '[{"type": "card", "label": "Card", "details": ""}, {"type": "momo", "label": "Mobile Money", "details": ""}]'::jsonb)
ON CONFLICT DO NOTHING;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_payment_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_config_updated_at
  BEFORE UPDATE ON public.payment_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payment_config_updated_at();