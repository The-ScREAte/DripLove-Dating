-- Create function to automatically handle subscription expiry
CREATE OR REPLACE FUNCTION public.handle_subscription_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Update expired subscriptions to 'expired' status and downgrade to free plan
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
    
  -- For failed recurring payments, mark as 'payment_failed'
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
$function$;
