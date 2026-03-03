-- Drop the problematic RLS policy that blocks OAuth users
DROP POLICY IF EXISTS "Only allow confirmed users" ON public.profiles;

-- Create a better policy that allows both confirmed email users AND OAuth users
CREATE POLICY "Allow authenticated users" ON public.profiles
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Allow confirmed email users
    (auth.jwt() ->> 'email_confirmed_at') IS NOT NULL
    -- Also allow OAuth users (they have app_metadata.provider set)
    OR (auth.jwt() -> 'app_metadata' ->> 'provider') IS NOT NULL
    -- Or allow if user already has a profile (for updates)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  )
);;
