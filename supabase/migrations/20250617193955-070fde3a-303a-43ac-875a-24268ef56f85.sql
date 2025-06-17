
-- Add admin role tracking to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create admin_actions table to track admin activities
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'match', 'delete', 'block', 'hold', 'create_admin'
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id_2 UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- for manual matches
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add account status to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'blocked', 'on_hold', 'deleted'));

-- Create RLS policies for admin_actions
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all admin actions" ON public.admin_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

CREATE POLICY "Admins can insert admin actions" ON public.admin_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- Function to manually create a match (admin only)
CREATE OR REPLACE FUNCTION public.admin_create_match(user1_id UUID, user2_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Create the match
  INSERT INTO matches (user1_id, user2_id)
  VALUES (
    LEAST(user1_id, user2_id),
    GREATEST(user1_id, user2_id)
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;
  
  -- Log the admin action
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, target_user_id_2)
  VALUES (auth.uid(), 'match', user1_id, user2_id);
END;
$$;

-- Function to update account status (admin only)
CREATE OR REPLACE FUNCTION public.admin_update_account_status(target_user_id UUID, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update account status
  UPDATE public.profiles 
  SET account_status = new_status 
  WHERE id = target_user_id;
  
  -- Log the admin action
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (auth.uid(), new_status, target_user_id, json_build_object('previous_status', 'active'));
END;
$$;

-- Function to create admin user
CREATE OR REPLACE FUNCTION public.create_admin_user(admin_email TEXT, admin_password TEXT, admin_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- This function would need to be called from an edge function
  -- since we can't create auth users directly from SQL
  RAISE EXCEPTION 'This function should be called via edge function';
END;
$$;

-- Update the get_app_stats function to include admin-specific data
CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles WHERE account_status = 'active'),
    'total_matches', (SELECT COUNT(*) FROM matches),
    'total_likes', (SELECT COUNT(*) FROM likes),
    'total_blocks', (SELECT COUNT(*) FROM blocks),
    'total_messages', (SELECT COUNT(*) FROM chats),
    'active_users_today', (
      SELECT COUNT(DISTINCT sender_id) 
      FROM chats 
      WHERE created_at >= CURRENT_DATE
    ),
    'new_users_this_week', (
      SELECT COUNT(*) 
      FROM profiles 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      AND account_status = 'active'
    ),
    'matches_this_week', (
      SELECT COUNT(*) 
      FROM matches 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'blocked_users', (SELECT COUNT(*) FROM profiles WHERE account_status = 'blocked'),
    'users_on_hold', (SELECT COUNT(*) FROM profiles WHERE account_status = 'on_hold'),
    'total_admins', (SELECT COUNT(*) FROM profiles WHERE is_admin = TRUE)
  ) INTO result;
  
  RETURN result;
END;
$$;
