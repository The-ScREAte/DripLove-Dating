
-- Drop existing problematic RLS policies on profiles table
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;  
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create simple, non-recursive RLS policies for profiles
CREATE POLICY "Enable read access for all users" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Enable update for users based on user_id" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Enable delete for users based on user_id" ON public.profiles FOR DELETE USING (auth.uid() = id);
