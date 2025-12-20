-- Create a cron job to check and expire subscriptions every hour
SELECT cron.schedule(
  'subscription-checker-hourly',
  '0 * * * *',  -- Run every hour at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://tgjsyyihabsovironesw.supabase.co/functions/v1/subscription-checker',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);