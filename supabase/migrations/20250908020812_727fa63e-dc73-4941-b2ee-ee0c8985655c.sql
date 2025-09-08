-- Add premium users count to admin stats function
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  result JSONB;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'active_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'active'),
    'total_matches', (SELECT COUNT(*) FROM public.matches),
    'total_likes', (SELECT COUNT(*) FROM public.likes),
    'total_blocks', (SELECT COUNT(*) FROM public.blocks),
    'total_messages', (SELECT COUNT(*) FROM public.chats),
    'pending_images', (SELECT COUNT(*) FROM public.user_images WHERE moderation_status = 'pending'),
    'blocked_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'blocked'),
    'users_on_hold', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'on_hold'),
    'total_admins', (SELECT COUNT(*) FROM public.profiles WHERE is_admin = TRUE),
    'premium_users', (
      SELECT COUNT(DISTINCT p.id)
      FROM public.profiles p
      JOIN public.user_subscriptions us ON p.id = us.user_id
      WHERE us.plan_name = 'premium' 
      AND us.status = 'active'
      AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ),
    'active_users_today', (
      SELECT COUNT(DISTINCT sender_id) 
      FROM public.chats 
      WHERE created_at >= CURRENT_DATE
    ),
    'new_users_this_week', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'matches_this_week', (
      SELECT COUNT(*) 
      FROM public.matches 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    )
  ) INTO result;
  
  RETURN result;
END;
$function$

---

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
$function$

---

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
$function$

---

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
$function$