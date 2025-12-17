-- Drop the problematic policy
DROP POLICY IF EXISTS "Allow authenticated users" ON public.profiles;

-- Create separate policies for different operations

-- For SELECT: Allow authenticated users to see profiles
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- For INSERT: Allow users to insert their own profile (auth.uid() must match the id)
CREATE POLICY "Users can create their own profile" ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- For UPDATE: Users can only update their own profile
CREATE POLICY "Users can modify their own profile" ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);