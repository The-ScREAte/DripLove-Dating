-- Add cron job for Paystack recurring billing (every hour at :05)
-- Uses the cron secret from internal_secrets for authentication

SELECT cron.schedule(
  'paystack-recurring-billing',
  '5 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://tgjsyyihabsovironesw.supabase.co/functions/v1/paystack-recurring-billing',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT value FROM public.internal_secrets WHERE key = 'paystack_billing_cron_secret')
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Also add cron for subscription-checker edge function (backup, every hour at :10)
SELECT cron.schedule(
  'subscription-checker-hourly',
  '10 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://tgjsyyihabsovironesw.supabase.co/functions/v1/subscription-checker',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);;
