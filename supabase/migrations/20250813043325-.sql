-- Update payment_config table to add Paystack plan configuration
-- Add paystack_plan_code column if it doesn't exist
ALTER TABLE public.payment_config 
ADD COLUMN IF NOT EXISTS paystack_plan_code TEXT;

-- Update the existing payment config with the Paystack plan ID
UPDATE public.payment_config 
SET paystack_plan_code = 'PLN_anuee0xs8qpvj98'
WHERE id = (SELECT id FROM public.payment_config LIMIT 1);

-- If no payment config exists, insert one
INSERT INTO public.payment_config (paystack_plan_code, premium_price, currency, payment_methods)
SELECT 'PLN_anuee0xs8qpvj98', 50, 'GHS', '[{"type": "card", "enabled": true}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.payment_config);