-- Drop the problematic RLS policy with self-reference
DROP POLICY IF EXISTS "Allow authenticated users" ON public.profiles;

-- Create a simpler policy that doesn't self-reference
CREATE POLICY "Allow authenticated users" ON public.profiles
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Allow confirmed email users
    (auth.jwt() ->> 'email_confirmed_at') IS NOT NULL
    -- Also allow OAuth users (they have app_metadata.provider set)
    OR (auth.jwt() -> 'app_metadata' ->> 'provider') IS NOT NULL
  )
);