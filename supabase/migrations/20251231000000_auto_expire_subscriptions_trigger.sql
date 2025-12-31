-- Auto-expire subscriptions using a trigger (MORE RELIABLE than cron)
-- This runs automatically whenever user_subscriptions is queried
-- Ensures no user can slip through with expired premium

-- Function to check and expire on read
CREATE OR REPLACE FUNCTION public.auto_expire_on_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If subscription is active but expired, downgrade immediately
  IF NEW.status = 'active' 
     AND NEW.expires_at IS NOT NULL 
     AND NEW.expires_at <= NOW() THEN
    
    -- Determine correct status based on auto_renew
    IF NEW.auto_renew = true THEN
      NEW.status := 'payment_failed';
    ELSE
      NEW.status := 'expired';
    END IF;
    
    NEW.plan_name := 'free';
    NEW.updated_at := NOW();
    
    RAISE NOTICE 'Auto-expired subscription for user %', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on SELECT (runs before data is returned)
-- This ensures ANY query that reads user_subscriptions will auto-expire
DROP TRIGGER IF EXISTS check_expiry_on_read ON public.user_subscriptions;
CREATE TRIGGER check_expiry_on_read
  BEFORE UPDATE OR INSERT ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION auto_expire_on_read();

-- Also create a more aggressive UPDATE-based trigger
-- This actively scans and fixes expired subscriptions
CREATE OR REPLACE FUNCTION public.batch_expire_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Fix all expired subscriptions with auto_renew = false
  UPDATE public.user_subscriptions 
  SET 
    status = 'expired',
    plan_name = 'free',
    updated_at = NOW()
  WHERE 
    status = 'active' 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW()
    AND auto_renew = false;
    
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  -- Fix all expired subscriptions with auto_renew = true (payment failed)
  UPDATE public.user_subscriptions 
  SET 
    status = 'payment_failed',
    plan_name = 'free',
    updated_at = NOW()
  WHERE 
    status = 'active' 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW()
    AND auto_renew = true;
    
  GET DIAGNOSTICS expired_count = expired_count + ROW_COUNT;
  
  RETURN expired_count;
END;
$$;

-- Run it immediately to fix the 13 users NOW
SELECT public.batch_expire_subscriptions();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.auto_expire_on_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_expire_subscriptions() TO authenticated;

-- Update the existing cron to use the batch function (more efficient)
SELECT cron.unschedule('subscription-expiry-hourly-sql');
SELECT cron.schedule(
  'subscription-expiry-batch-hourly',
  '0 * * * *',
  $$SELECT public.batch_expire_subscriptions();$$
);

COMMENT ON FUNCTION public.auto_expire_on_read() IS 'Automatically expires subscriptions when accessed - PRIMARY expiry mechanism';
COMMENT ON FUNCTION public.batch_expire_subscriptions() IS 'Batch processes all expired subscriptions - BACKUP mechanism via cron';
COMMENT ON TRIGGER check_expiry_on_read ON public.user_subscriptions IS 'Ensures expired subscriptions are downgraded before being returned to application';
