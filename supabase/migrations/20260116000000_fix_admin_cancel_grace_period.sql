-- Fix admin_cancel_premium_subscription to respect grace period
-- When admin cancels, set status to 'cancelled' but keep plan_name and expires_at
-- Premium access continues until expires_at, then auto-expires via client check

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

  -- Update subscription to cancelled but keep plan_name and expires_at
  -- This allows user to keep premium access until their expiration date
  UPDATE public.user_subscriptions
  SET 
    status = 'cancelled',
    auto_renew = false,
    updated_at = NOW()
  WHERE user_id = target_user_id
    AND plan_name = 'premium'
    AND status = 'active';

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
$function$;
