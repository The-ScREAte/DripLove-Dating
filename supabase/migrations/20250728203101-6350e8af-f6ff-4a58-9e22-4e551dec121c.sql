-- Add enabled_countries column to payment_config table
ALTER TABLE payment_config 
ADD COLUMN IF NOT EXISTS enabled_countries jsonb DEFAULT '[]'::jsonb;