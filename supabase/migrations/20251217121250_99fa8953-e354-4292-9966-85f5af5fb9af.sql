-- Add INSERT policy to scheduled_broadcast_history for service role (edge function)
-- This allows the edge function to record execution history

-- First check if policy doesn't exist already and create it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'scheduled_broadcast_history' 
        AND policyname = 'Service role can insert history'
    ) THEN
        CREATE POLICY "Service role can insert history"
        ON public.scheduled_broadcast_history
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    END IF;
END $$;

-- Also add a more permissive policy for service role
DROP POLICY IF EXISTS "Allow service role full access to history" ON public.scheduled_broadcast_history;
CREATE POLICY "Allow service role full access to history"
ON public.scheduled_broadcast_history
FOR ALL
USING (true)
WITH CHECK (true);