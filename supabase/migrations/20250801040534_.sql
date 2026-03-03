-- Create function to cancel user subscription
CREATE OR REPLACE FUNCTION public.cancel_user_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  uid UUID;
  subscription_record RECORD;
BEGIN
  -- Get the current user's ID from the JWT
  uid := auth.uid();
  
  IF uid IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the active subscription record
  SELECT * INTO subscription_record
  FROM public.user_subscriptions
  WHERE user_id = uid AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription found';
  END IF;

  -- Update the subscription status to cancelled
  UPDATE public.user_subscriptions
  SET 
    status = 'cancelled',
    updated_at = NOW(),
    auto_renew = false
  WHERE user_id = uid AND status = 'active';

END;
$$;;
