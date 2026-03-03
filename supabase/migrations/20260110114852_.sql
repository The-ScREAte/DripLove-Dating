-- Fix get_current_subscription_status to recognize cancelled subscriptions as still premium until expires_at
CREATE OR REPLACE FUNCTION public.get_current_subscription_status(p_user_id uuid)
RETURNS TABLE(plan_name text, status text, expires_at timestamp with time zone, is_active boolean)
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
     AND subscription_record.status IN ('active', 'cancelled') THEN
    
    -- Update to expired/free
    UPDATE public.user_subscriptions
    SET 
      status = 'expired',
      plan_name = 'free',
      updated_at = NOW()
    WHERE id = subscription_record.id;
    
    -- Return updated status
    RETURN QUERY SELECT 
      'free'::text,
      'expired'::text,
      subscription_record.expires_at,
      false::boolean;
  ELSE
    -- Return current status
    -- IMPORTANT: Cancelled subscriptions are still premium until expires_at
    RETURN QUERY SELECT 
      subscription_record.plan_name::text,
      subscription_record.status::text,
      subscription_record.expires_at,
      (subscription_record.status IN ('active', 'cancelled') AND 
       subscription_record.plan_name = 'premium' AND
       (subscription_record.expires_at IS NULL OR subscription_record.expires_at > NOW()))::boolean;
  END IF;
END;
$function$;;
