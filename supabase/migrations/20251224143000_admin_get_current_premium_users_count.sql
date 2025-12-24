-- Admin RPC: count current premium users (active subscriptions right now)
-- Premium logic:
-- plan_name = 'premium' AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())

CREATE OR REPLACE FUNCTION public.admin_get_current_premium_users_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  premium_count INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT COUNT(DISTINCT us.user_id)
    INTO premium_count
  FROM public.user_subscriptions us
  WHERE us.plan_name = 'premium'
    AND us.status = 'active'
    AND (us.expires_at IS NULL OR us.expires_at > NOW());

  RETURN COALESCE(premium_count, 0);
END;
$function$;
