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
$function$

-- Create function to handle payment failures
CREATE OR REPLACE FUNCTION public.handle_payment_failure(p_user_id uuid, p_reason text DEFAULT 'Payment failed')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Update subscription to failed status and downgrade to free
  UPDATE public.user_subscriptions
  SET 
    status = 'payment_failed',
    plan_name = 'free',
    updated_at = NOW()
  WHERE 
    user_id = p_user_id 
    AND status = 'active';
    
  -- Log the failure reason
  INSERT INTO public.admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    '00000000-0000-0000-0000-000000000000', -- System user
    'payment_failure',
    p_user_id,
    json_build_object('reason', p_reason, 'timestamp', NOW())
  );
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$function$

-- Create function to validate and update subscription status in real-time
CREATE OR REPLACE FUNCTION public.get_current_subscription_status(p_user_id uuid)
RETURNS TABLE(
  plan_name text,
  status text,
  expires_at timestamp with time zone,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  subscription_record RECORD;
BEGIN
  -- Get the user's current subscription
  SELECT * INTO subscription_record
  FROM public.user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no subscription exists, return free plan
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      'free'::text,
      'active'::text,
      NULL::timestamp with time zone,
      true::boolean;
    RETURN;
  END IF;
  
  -- Check if subscription has expired and should be downgraded
  IF subscription_record.expires_at IS NOT NULL 
     AND subscription_record.expires_at <= NOW() 
     AND subscription_record.status = 'active' THEN
    
    -- Update to expired/free
    UPDATE public.user_subscriptions
    SET 
      status = CASE 
        WHEN auto_renew THEN 'payment_failed'
        ELSE 'expired'
      END,
      plan_name = 'free',
      updated_at = NOW()
    WHERE id = subscription_record.id;
    
    -- Return updated status
    RETURN QUERY SELECT 
      'free'::text,
      CASE 
        WHEN subscription_record.auto_renew THEN 'payment_failed'
        ELSE 'expired'
      END::text,
      subscription_record.expires_at,
      false::boolean;
  ELSE
    -- Return current status
    RETURN QUERY SELECT 
      subscription_record.plan_name::text,
      subscription_record.status::text,
      subscription_record.expires_at,
      (subscription_record.status = 'active' AND 
       (subscription_record.expires_at IS NULL OR subscription_record.expires_at > NOW()))::boolean;
  END IF;
END;
$function$