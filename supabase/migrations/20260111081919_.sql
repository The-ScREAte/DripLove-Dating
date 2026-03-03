-- Fix overly permissive RLS policy on scheduled_broadcast_history
-- The current policy allows ANY authenticated user full access

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow service role full access to history" ON public.scheduled_broadcast_history;

-- Create proper service_role-only policy
-- Note: service_role bypasses RLS by default, but explicit policy is clearer
CREATE POLICY "Service role full access to history"
ON public.scheduled_broadcast_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- The existing admin SELECT policy should remain as-is:
-- "Admins can view scheduled broadcast history" - allows admins to read only;
