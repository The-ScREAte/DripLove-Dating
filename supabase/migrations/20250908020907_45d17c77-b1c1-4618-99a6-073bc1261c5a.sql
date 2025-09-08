-- Function to manually set premium subscription for a user
CREATE OR REPLACE FUNCTION public.admin_set_premium_subscription(
  target_user_id UUID,
  months_count INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  expires_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Calculate expiration date
  expires_date := NOW() + (months_count || ' months')::INTERVAL;

  -- Insert or update subscription
  INSERT INTO public.user_subscriptions (
    user_id,
    plan_name,
    status,
    starts_at,
    expires_at,
    auto_renew,
    payment_method
  )
  VALUES (
    target_user_id,
    'premium',
    'active',
    NOW(),
    expires_date,
    false,
    'admin_manual'
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    plan_name = 'premium',
    status = 'active',
    starts_at = NOW(),
    expires_at = expires_date,
    auto_renew = false,
    payment_method = 'admin_manual',
    updated_at = NOW();

  -- Log the admin action
  INSERT INTO public.admin_actions (
    admin_id, 
    action_type, 
    target_user_id, 
    details
  )
  VALUES (
    auth.uid(), 
    'set_premium', 
    target_user_id,
    json_build_object('months', months_count, 'expires_at', expires_date)
  );

  RETURN TRUE;
END;
$function$;