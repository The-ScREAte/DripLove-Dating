-- Add default international pricing fields to payment_config
ALTER TABLE public.payment_config 
ADD COLUMN IF NOT EXISTS default_international_price NUMERIC DEFAULT 5,
ADD COLUMN IF NOT EXISTS default_international_currency TEXT DEFAULT 'USD';

-- Add comment for clarity
COMMENT ON COLUMN public.payment_config.default_international_price IS 'Default price in international currency (usually USD) for countries not in country_prices list';
COMMENT ON COLUMN public.payment_config.default_international_currency IS 'Default international currency code (e.g., USD, EUR) for fallback pricing';