-- Add all_time_premium_users to get_admin_stats()
-- Premium Now remains premium_users (active premium subscriptions)

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

    -- Premium Now (active premium subscriptions)
    'premium_users', (
      SELECT COUNT(DISTINCT us.user_id)
      FROM public.user_subscriptions us
      JOIN public.profiles p ON p.id = us.user_id
      WHERE p.is_admin = false
        AND us.plan_name = 'premium'
        AND us.status = 'active'
    ),

    -- All Time Premium:
    -- 1) plan_name=premium and status in active/cancelled/canceled/expired/payment_failed
    -- 2) plan_name=free and status in cancelled/canceled/payment_failed
    'all_time_premium_users', (
      SELECT COUNT(DISTINCT us.user_id)
      FROM public.user_subscriptions us
      JOIN public.profiles p ON p.id = us.user_id
      WHERE p.is_admin = false
        AND (
          (us.plan_name = 'premium' AND us.status IN ('active','cancelled','canceled','expired','payment_failed'))
          OR
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
