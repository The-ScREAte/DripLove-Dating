-- Drop the problematic cron job that uses pg_net
SELECT cron.unschedule('process-scheduled-broadcasts');

-- The broadcast processing should be triggered via edge function invocation
-- Since pg_net is not available, we'll rely on external scheduling (like a webhook or manual trigger)
-- OR use pg_cron with plpgsql only (no HTTP calls)

-- For now, just clean up the broken job
-- The scheduled broadcasts can be processed by calling the edge function directly