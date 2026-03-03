-- Create function to get premium status for multiple users (for admin user management)
CREATE OR REPLACE FUNCTION public.admin_get_premium_status_for_users(target_user_ids uuid[])
RETURNS TABLE(user_id uuid, is_premium boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
    p.id as user_id,
    CASE 
      WHEN us.plan_name = 'premium' 
        AND us.status = 'active' 
        AND (us.expires_at IS NULL OR us.expires_at > NOW()) 
      THEN TRUE 
      ELSE FALSE 
    END as is_premium
  FROM unnest(target_user_ids) AS p(id)
  LEFT JOIN public.user_subscriptions us ON p.id = us.user_id;
END;
$$;;
