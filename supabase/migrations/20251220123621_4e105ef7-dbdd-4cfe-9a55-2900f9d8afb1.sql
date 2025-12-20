-- Create a table to track total users ever (including deleted)
CREATE TABLE IF NOT EXISTS public.user_stats_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stat_type text NOT NULL,
  stat_value integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add unique constraint for stat_type
ALTER TABLE public.user_stats_history ADD CONSTRAINT user_stats_history_stat_type_unique UNIQUE (stat_type);

-- Enable RLS
ALTER TABLE public.user_stats_history ENABLE ROW LEVEL SECURITY;

-- Allow admins to read and manage
CREATE POLICY "Admins can manage user_stats_history"
  ON public.user_stats_history
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

-- Initialize total_users_ever with current count
INSERT INTO public.user_stats_history (stat_type, stat_value)
VALUES ('total_users_ever', (SELECT COUNT(*) FROM public.profiles))
ON CONFLICT (stat_type) DO NOTHING;

-- Create trigger function to increment total_users_ever on new profile
CREATE OR REPLACE FUNCTION public.increment_total_users_ever()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_stats_history (stat_type, stat_value, updated_at)
  VALUES ('total_users_ever', 1, now())
  ON CONFLICT (stat_type) 
  DO UPDATE SET stat_value = user_stats_history.stat_value + 1, updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on profiles table for new user creation
DROP TRIGGER IF EXISTS on_new_profile_increment_total ON public.profiles;
CREATE TRIGGER on_new_profile_increment_total
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.increment_total_users_ever();

-- Update get_admin_stats function to include new stats
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSONB AS $$
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
    'total_users_ever', COALESCE((
      SELECT stat_value FROM public.user_stats_history WHERE stat_type = 'total_users_ever'
    ), (SELECT COUNT(*) FROM public.profiles)),
    'active_users_30_days', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE last_login_at >= NOW() - INTERVAL '30 days'
    ),
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;