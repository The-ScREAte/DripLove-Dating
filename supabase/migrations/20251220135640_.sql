-- Create cron job for scheduled broadcasts (runs every 15 minutes)
SELECT cron.schedule(
  'process-scheduled-broadcasts',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-scheduled-broadcasts',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);;
