-- Automate the retry-when-limit-restores loop for broadcast emails.
--
-- process-email-queue already existed and correctly picks up any pending
-- email_send_queue row and (re)attempts it against whichever SMTP account
-- still has daily quota left - but nothing ever called it automatically, so
-- the queue only drained when a human manually invoked the function. Combined
-- with the accompanying code fix (temporary/rate-limited failures now get put
-- back to 'pending' instead of a permanent 'failed'), this cron job is what
-- actually closes the loop: keep sending until the limit is hit, stop, and
-- pick back up on its own next time it runs (same day on a different account
-- if one still has room, or the next day once each account's daily quota
-- resets - the function already checks live quota on every run).
--
-- Every 15 minutes: cheap to run when there's nothing to do (returns
-- immediately), and frequent enough to drain a large backlog steadily across
-- however many accounts/days it takes without needing a human involved.
select cron.schedule(
  'process-email-queue-every-15-min',
  '*/15 * * * *',
  $$
  select
    net.http_post(
      url:='https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-email-queue',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
