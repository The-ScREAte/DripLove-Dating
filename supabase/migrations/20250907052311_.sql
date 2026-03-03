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
$function$;
