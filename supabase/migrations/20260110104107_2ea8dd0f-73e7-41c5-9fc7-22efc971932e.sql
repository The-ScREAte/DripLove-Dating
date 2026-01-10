-- Add provider_transaction_id to store gateway references (Paystack/IAP/etc.)
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;

-- Optional index to speed up lookups by provider transaction id
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_provider_tx
ON public.user_subscriptions (provider_transaction_id);
