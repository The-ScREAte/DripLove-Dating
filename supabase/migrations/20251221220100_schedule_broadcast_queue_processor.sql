-- Schedule broadcast queue processor to run every minute
-- This processes pending broadcast recipients in background

SELECT cron.schedule(
  'process-broadcast-queue',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/process-broadcast-queue'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.service_role_key'))
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Comment for documentation
COMMENT ON EXTENSION pg_cron IS 'Processes broadcast queue every minute for reliable fire-and-forget notifications';
