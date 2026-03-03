-- Drop the existing check constraint and add payment_failed status
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;

-- Add back the constraint with payment_failed included
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_status_check 
CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'cancelled'::text, 'expired'::text, 'paused'::text, 'payment_failed'::text]));

-- Now fix the handle_subscription_expiry function to work correctly
CREATE OR REPLACE FUNCTION public.handle_subscription_expiry()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update expired subscriptions with auto_renew = false to 'expired' status
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
    
  -- For subscriptions with auto_renew = true that have expired, mark as 'payment_failed'
  -- This indicates the renewal didn't happen (e.g., payment method failed)
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
END;
$function$;;
