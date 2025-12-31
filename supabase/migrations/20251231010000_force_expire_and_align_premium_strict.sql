-- Force immediate expiry of all stale subscriptions
-- Then align ALL premium checks to use STRICT definition (expires_at must be valid)

-- 1. Run the existing batch expiry function RIGHT NOW to fix any stale data
SELECT public.handle_subscription_expiry();

-- 2. Update Platform Stats to use STRICT definition (include expires_at check)
CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
  today_active_count INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Calculate today's active count fresh
  SELECT COUNT(*) INTO today_active_count
  FROM public.profiles 
  WHERE last_login_at >= CURRENT_DATE 
    AND is_admin = false;

  -- Record/update today's count in history
  INSERT INTO public.daily_active_stats (stat_date, active_count, updated_at)
  VALUES (CURRENT_DATE, today_active_count, now())
  ON CONFLICT (stat_date) 
  DO UPDATE SET 
    active_count = GREATEST(daily_active_stats.active_count, EXCLUDED.active_count),
    updated_at = now();

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles WHERE is_admin = false),
    'total_users_ever', COALESCE((
      SELECT stat_value FROM public.user_stats_history WHERE stat_type = 'total_users_ever'
    ), (SELECT COUNT(*) FROM public.profiles)),
    'active_users_30_days', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE is_admin = false 
      AND (last_login_at >= NOW() - INTERVAL '30 days' OR (last_login_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'))
    ),
    'active_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'active' AND is_admin = false),
    'archived_users', (SELECT COUNT(*) FROM public.profiles WHERE is_archived = true AND is_admin = false),
    'total_matches', (SELECT COUNT(*) FROM public.matches),
    'total_likes', (SELECT COUNT(*) FROM public.likes),
    'total_blocks', (SELECT COUNT(*) FROM public.blocks),
    'total_messages', (SELECT COUNT(*) FROM public.chats),
    'pending_images', (SELECT COUNT(*) FROM public.user_images WHERE moderation_status = 'pending'),
    'blocked_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'blocked' AND is_admin = false),
    'users_on_hold', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'on_hold' AND is_admin = false),
    'total_admins', (SELECT COUNT(*) FROM public.profiles WHERE is_admin = TRUE),

    -- Premium Now (STRICT: active premium subscriptions with valid expiry)
    'premium_users', (
      SELECT COUNT(DISTINCT us.user_id)
      FROM public.user_subscriptions us
      JOIN public.profiles p ON p.id = us.user_id
      WHERE p.is_admin = false
        AND us.plan_name = 'premium'
        AND us.status = 'active'
        AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ),

    -- All Time Premium (STRICT: only count premium who were ACTUALLY premium)
    -- 1) Currently active premium with valid expiry
    -- 2) Previously premium (cancelled/expired/payment_failed) who HAD valid premium time
    'all_time_premium_users', (
      SELECT COUNT(DISTINCT us.user_id)
      FROM public.user_subscriptions us
      JOIN public.profiles p ON p.id = us.user_id
      WHERE p.is_admin = false
        AND (
          -- Currently premium and not expired
          (us.plan_name = 'premium' AND us.status = 'active' AND (us.expires_at IS NULL OR us.expires_at > NOW()))
          OR
          -- Was premium but now cancelled/expired/failed (they DID have premium time)
          (us.plan_name = 'premium' AND us.status IN ('cancelled','canceled','expired','payment_failed'))
          OR
          -- Downgraded to free after being premium (cancelled/failed subscriptions)
          (us.plan_name = 'free' AND us.status IN ('cancelled','canceled','payment_failed'))
        )
    ),

    'active_now', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE last_login_at >= NOW() - INTERVAL '20 minutes'
        AND is_admin = false
    ),
    'active_users_today', today_active_count,
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
$function$;

-- 3. Update User Filter RPC to use STRICT definition (include expires_at check)
CREATE OR REPLACE FUNCTION public.admin_get_premium_status_for_users(target_user_ids uuid[])
RETURNS TABLE(user_id uuid, is_premium boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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

  -- Return exactly one row per requested user_id
  -- STRICT definition: premium + active + not expired
  RETURN QUERY
  SELECT
    p.id AS user_id,
    EXISTS (
      SELECT 1
      FROM public.user_subscriptions us
      WHERE us.user_id = p.id
        AND us.plan_name = 'premium'
        AND us.status = 'active'
        AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ) AS is_premium
  FROM public.profiles p
  WHERE p.id = ANY(target_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_premium_status_for_users(uuid[]) TO authenticated;

-- 4. Add a helper function admins can call anytime to force expiry check
CREATE OR REPLACE FUNCTION public.admin_force_expire_subscriptions()
RETURNS TABLE(
  expired_count integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  count_expired integer;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Call the batch expiry function
  SELECT public.handle_subscription_expiry();
  
  -- Count how many are still showing as active premium but expired
  SELECT COUNT(*) INTO count_expired
  FROM public.user_subscriptions
  WHERE plan_name = 'premium'
    AND status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= NOW();

  RETURN QUERY SELECT 
    count_expired,
    CASE 
      WHEN count_expired = 0 THEN 'All subscriptions are valid ✓'
      ELSE 'Found ' || count_expired || ' stale subscriptions - run handle_subscription_expiry() again'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_expire_subscriptions() TO authenticated;

-- 5. Run expiry one more time to ensure everything is clean
SELECT public.handle_subscription_expiry();

-- 6. Verify results
DO $$
DECLARE
  premium_count integer;
  stale_count integer;
BEGIN
  -- Count truly active premium
  SELECT COUNT(DISTINCT user_id) INTO premium_count
  FROM public.user_subscriptions
  WHERE plan_name = 'premium'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW());
    
  -- Count stale (should be 0)
  SELECT COUNT(*) INTO stale_count
  FROM public.user_subscriptions
  WHERE plan_name = 'premium'
    AND status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= NOW();
    
  RAISE NOTICE '✓ Active Premium Users: %', premium_count;
  RAISE NOTICE '✓ Stale Subscriptions: % (should be 0)', stale_count;
END $$;
