-- Function to cancel premium subscription for a user
CREATE OR REPLACE FUNCTION public.admin_cancel_premium_subscription(
  target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Update subscription to cancelled/free
  UPDATE public.user_subscriptions
  SET 
    plan_name = 'free',
    status = 'cancelled',
    expires_at = NOW(),
    auto_renew = false,
    updated_at = NOW()
  WHERE user_id = target_user_id;

  -- Log the admin action
  INSERT INTO public.admin_actions (
    admin_id, 
    action_type, 
    target_user_id
  )
  VALUES (
    auth.uid(), 
    'cancel_premium', 
    target_user_id
  );

  RETURN TRUE;
END;
$function$;;
