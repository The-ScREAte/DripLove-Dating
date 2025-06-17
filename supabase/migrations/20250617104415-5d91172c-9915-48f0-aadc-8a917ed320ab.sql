
-- Drop all existing policies again
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_others" ON public.profiles;

-- Disable RLS temporarily
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create a single, simple policy that allows all authenticated users to read all profiles
-- and only update their own
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT 
  USING (true);

CREATE POLICY "profiles_insert_own_simple" ON public.profiles
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own_simple" ON public.profiles
  FOR UPDATE 
  USING (auth.uid() = id);
