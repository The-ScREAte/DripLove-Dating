-- Add Paystack plan configuration to payment_config table
-- First check if the table exists, if not create it
CREATE TABLE IF NOT EXISTS public.payment_config (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'paystack',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

-- Create policy to allow reading payment config
CREATE POLICY "payment_config_read" ON public.payment_config
FOR SELECT USING (true);

-- Create policy for admin updates
CREATE POLICY "payment_config_admin_update" ON public.payment_config
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Insert or update Paystack configuration with the plan ID
INSERT INTO public.payment_config (provider, config, is_active)
VALUES (
  'paystack',
  jsonb_build_object(
    'plan_code', 'PLN_anuee0xs8qpvj98',
    'secret_key_name', 'PAYSTACK_SECRET_KEY',
    'public_key_name', 'PAYSTACK_PUBLIC_KEY'
  ),
  true
)
ON CONFLICT (provider) DO UPDATE SET
  config = jsonb_build_object(
    'plan_code', 'PLN_anuee0xs8qpvj98',
    'secret_key_name', 'PAYSTACK_SECRET_KEY',
    'public_key_name', 'PAYSTACK_PUBLIC_KEY'
  ),
  updated_at = now();