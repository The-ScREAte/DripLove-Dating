-- Add last_login_at column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone DEFAULT NULL;

-- Add login_count column to track total logins
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS login_count integer DEFAULT 0;

-- Create a function to update last login timestamp
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles 
  SET 
    last_login_at = NOW(),
    login_count = COALESCE(login_count, 0) + 1
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for login tracking (on session creation)
-- Note: We'll handle this via the app instead since we can't attach triggers to auth schema