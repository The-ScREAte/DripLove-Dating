-- Add columns for enhanced subscription management
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS country TEXT;

-- Add columns for recurring billing (if they don't exist from previous migration)
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS flw_card_token TEXT,
ADD COLUMN IF NOT EXISTS flw_momo_token TEXT,
ADD COLUMN IF NOT EXISTS flw_subscription_id TEXT;

-- Update existing subscriptions to have auto_renew enabled
UPDATE public.user_subscriptions 
SET auto_renew = true, 
    next_billing_date = expires_at,
    updated_at = now()
WHERE auto_renew IS NULL;
