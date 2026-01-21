-- ============================================================================
-- CANCELLATION REQUESTED SYSTEM - DATABASE MIGRATION
-- Run this SQL in your Supabase SQL Editor
-- ============================================================================

-- Step 1: Add new columns to user_subscriptions table
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP WITH TIME ZONE;

-- Step 2: Migrate existing 'cancelled' subscriptions to new system
-- Keep them active until expiry with cancellation_requested flag
UPDATE public.user_subscriptions
SET 
  cancellation_requested = true,
  cancellation_requested_at = updated_at,
  status = 'active',  -- Keep active until expiry!
  auto_renew = false
WHERE status = 'cancelled' 
  AND plan_name = 'premium'
  AND expires_at IS NOT NULL
  AND expires_at > NOW();  -- Only if not yet expired

-- Step 3: Update handle_subscription_expiry function to process cancellation_requested
CREATE OR REPLACE FUNCTION public.handle_subscription_expiry()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Process subscriptions with cancellation_requested=true that have expired
  UPDATE public.user_subscriptions 
  SET 
    status = 'expired',
    plan_name = 'free',
    updated_at = NOW()
  WHERE 
    cancellation_requested = true
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW()
    AND status = 'active';
    
  -- Process active subscriptions with auto_renew=false that have expired
  UPDATE public.user_subscriptions 
  SET 
    status = 'expired',
    plan_name = 'free',
    updated_at = NOW()
  WHERE 
    status = 'active' 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW()
    AND auto_renew = false
    AND (cancellation_requested IS NULL OR cancellation_requested = false);
    
  -- Process old 'cancelled' status subscriptions that expired
  UPDATE public.user_subscriptions 
  SET 
    status = 'expired',
    plan_name = 'free',
    updated_at = NOW()
  WHERE 
    status = 'cancelled' 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW();
    
  -- For subscriptions with auto_renew=true that have expired, mark as 'payment_failed'
  UPDATE public.user_subscriptions 
  SET 
    status = 'payment_failed',
    plan_name = 'free',
    updated_at = NOW()
  WHERE 
    status = 'active' 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW()
    AND auto_renew = true
    AND (cancellation_requested IS NULL OR cancellation_requested = false);
END;
$function$;

-- Step 4: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancellation_requested 
ON public.user_subscriptions(cancellation_requested) 
WHERE cancellation_requested = true;

-- Step 5: Verify migration
SELECT 
  status,
  cancellation_requested,
  COUNT(*) as count,
  COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as not_expired,
  COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired
FROM public.user_subscriptions
GROUP BY status, cancellation_requested
ORDER BY status, cancellation_requested;

-- ============================================================================
-- Expected results after migration:
-- - Old 'cancelled' subscriptions → status='active', cancellation_requested=true
-- - Users keep premium until expires_at
-- - handle_subscription_expiry will process them when expires_at passes
-- ============================================================================
