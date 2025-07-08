-- Add columns for recurring billing tokens for both card and MoMo
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS flw_card_token text,
ADD COLUMN IF NOT EXISTS flw_momo_token text,
ADD COLUMN IF NOT EXISTS flw_subscription_id text;

-- You may want to add indexes or unique constraints as needed.
-- These columns will store the recurring billing tokens/IDs returned by Flutterwave for automatic monthly charges.
