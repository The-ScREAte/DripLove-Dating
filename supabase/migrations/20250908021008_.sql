-- Function to get user's current premium status
CREATE OR REPLACE FUNCTION public.admin_get_user_premium_status(
  target_user_id UUID
)
RETURNS TABLE(
  is_premium BOOLEAN,
  plan_name TEXT,
  status TEXT,
  expires_at TIMESTAMP WITH TIME ZONE
)
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

  RETURN QUERY
  SELECT 
    CASE 
      WHEN us.plan_name = 'premium' AND us.status = 'active' 
      AND (us.expires_at IS NULL OR us.expires_at > NOW()) 
      THEN TRUE 
      ELSE FALSE 
    END as is_premium,
    COALESCE(us.plan_name, 'free') as plan_name,
    COALESCE(us.status, 'none') as status,
    us.expires_at
  FROM public.profiles p
  LEFT JOIN public.user_subscriptions us ON p.id = us.user_id
  WHERE p.id = target_user_id
  LIMIT 1;
END;
$function$;;
