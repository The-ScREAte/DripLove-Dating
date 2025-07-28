-- Add country_prices JSONB column to payment_config table
ALTER TABLE payment_config
ADD COLUMN country_prices JSONB DEFAULT '{}';

-- Update existing record with sample country prices
UPDATE payment_config 
SET country_prices = '{
  "GHS": 50,
  "NGN": 8000,
  "KES": 2000,
  "TZS": 40000,
  "XOF": 15000,
  "EGP": 1000
}'::jsonb
WHERE id IS NOT NULL;