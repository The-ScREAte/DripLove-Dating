-- Fix get_admin_stats to properly track Premium Now and All Time Premium
-- Premium Now: users with plan_name='premium' AND status='active'
-- All Time Premium: users with plan_name='premium' AND status IN ('active', 'cancelled', 'payment_failed')

CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- Record today's active count for historical tracking
  PERFORM public.record_daily_active_count();

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
    -- Premium Now: only active premium subscriptions
    'premium_users', (
      SELECT COUNT(DISTINCT p.id)
      FROM public.profiles p
      JOIN public.user_subscriptions us ON p.id = us.user_id
      WHERE us.plan_name = 'premium' 
      AND us.status = 'active'
      AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ),
    -- All Time Premium: active, cancelled, and payment_failed
    'all_time_premium_users', (
      SELECT COUNT(DISTINCT p.id)
      FROM public.profiles p
      JOIN public.user_subscriptions us ON p.id = us.user_id
      WHERE us.plan_name = 'premium' 
      AND us.status IN ('active', 'cancelled', 'payment_failed')
    ),
    'active_now', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE last_login_at >= NOW() - INTERVAL '20 minutes'
        AND is_admin = false
    ),
    'active_users_today', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE last_login_at >= CURRENT_DATE
        AND is_admin = false
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
$function$;
