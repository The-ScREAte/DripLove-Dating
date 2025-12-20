-- Add is_archived column to profiles (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_archived boolean DEFAULT false;
  END IF;
END $$;

-- Create index for faster queries filtering archived users
CREATE INDEX IF NOT EXISTS idx_profiles_is_archived ON public.profiles(is_archived);

-- Create function to auto-archive inactive users (30+ days)
CREATE OR REPLACE FUNCTION public.auto_archive_inactive_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Archive users who haven't logged in for 30+ days
  UPDATE profiles
  SET is_archived = true
  WHERE is_archived = false
    AND last_login_at IS NOT NULL
    AND last_login_at < NOW() - INTERVAL '30 days';
  
  -- Also archive users who have never logged in and created 30+ days ago
  UPDATE profiles
  SET is_archived = true
  WHERE is_archived = false
    AND last_login_at IS NULL
    AND created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Drop existing get_admin_stats function to change return type
DROP FUNCTION IF EXISTS public.get_admin_stats();

-- Recreate get_admin_stats with archived users count
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
    'active_users_today', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE last_login_at >= CURRENT_DATE
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