-- Fix profile creation via auth trigger: allow inserts performed by internal Supabase roles

DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;

CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (
  -- Normal client-side insert: user can only create their own row
  auth.uid() = id
  OR
  -- Server-side inserts (e.g., auth trigger) run without JWT claims
  current_user IN ('postgres', 'supabase_auth_admin')
);;
