-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Create a cron job to cleanup old messages daily at 2 AM
select cron.schedule(
  'cleanup-old-messages-daily', -- job name
  '0 2 * * *', -- Run at 2 AM every day (cron format)
  $$
  select
    net.http_post(
      url:='${SUPABASE_URL}/functions/v1/cleanup-old-messages',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization', 'Bearer ${SERVICE_ROLE_KEY}'
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Grant necessary permissions
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
