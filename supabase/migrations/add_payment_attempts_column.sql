-- Add payment_attempts column to user_subscriptions table
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS payment_attempts INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN public.user_subscriptions.payment_attempts IS 'Number of failed payment attempts for this subscription';

-- Update existing subscriptions to have 0 payment attempts
UPDATE public.user_subscriptions 
SET payment_attempts = 0 
WHERE payment_attempts IS NULL;
