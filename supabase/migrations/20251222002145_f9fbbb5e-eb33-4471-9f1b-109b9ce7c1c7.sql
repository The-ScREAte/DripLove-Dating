-- Create table to store daily active user counts for historical tracking
CREATE TABLE IF NOT EXISTS public.daily_active_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date date NOT NULL UNIQUE,
  active_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_active_stats ENABLE ROW LEVEL SECURITY;

-- Create index for date lookups
CREATE INDEX IF NOT EXISTS idx_daily_active_stats_date ON public.daily_active_stats(stat_date DESC);

-- Create policy for admins to manage
CREATE POLICY "Admins can manage daily_active_stats"
ON public.daily_active_stats FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid() AND profiles.is_admin = true
));

-- Function to record today's active count (call this daily via cron or on each admin stats fetch)
CREATE OR REPLACE FUNCTION public.record_daily_active_count()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today_count integer;
BEGIN
  -- Count users who logged in today
  SELECT COUNT(*) INTO today_count
  FROM public.profiles
  WHERE last_login_at >= CURRENT_DATE
    AND is_admin = false;
  
  -- Upsert the count for today
  INSERT INTO public.daily_active_stats (stat_date, active_count, updated_at)
  VALUES (CURRENT_DATE, today_count, now())
  ON CONFLICT (stat_date) 
  DO UPDATE SET active_count = EXCLUDED.active_count, updated_at = now();
END;
$$;

-- Function to get active users for a specific date
CREATE OR REPLACE FUNCTION public.get_active_users_for_date(target_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result integer;
BEGIN
  -- First check if we have historical data
  SELECT active_count INTO result
  FROM public.daily_active_stats
  WHERE stat_date = target_date;
  
  -- If no historical data and it's today, calculate live
  IF result IS NULL AND target_date = CURRENT_DATE THEN
    SELECT COUNT(*) INTO result
    FROM public.profiles
    WHERE last_login_at >= CURRENT_DATE
      AND is_admin = false;
  END IF;
  
  RETURN COALESCE(result, 0);
END;
$$;

-- Drop and recreate get_admin_stats to include active_now
DROP FUNCTION IF EXISTS public.get_admin_stats();

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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
    'premium_users', (
      SELECT COUNT(DISTINCT p.id)
      FROM public.profiles p
      JOIN public.user_subscriptions us ON p.id = us.user_id
      WHERE us.plan_name = 'premium' 
      AND us.status = 'active'
      AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ),
    'active_now', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE last_login_at >= NOW() - INTERVAL '15 minutes'
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
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.record_daily_active_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_users_for_date(date) TO authenticated;