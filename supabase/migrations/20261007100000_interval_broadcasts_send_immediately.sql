-- Interval broadcasts went out up to a minute late: run-interval-broadcasts and
-- process-broadcast-queue-every-minute both fire at the top of the minute, and
-- when the queue job checked for work before the new campaign existed it waited
-- a whole minute. Start the queue as soon as a send has been created.

select cron.unschedule(jobid) from cron.job where jobname = 'run-interval-broadcasts';
select cron.schedule('run-interval-broadcasts', '* * * * *', $cmd$
  select net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-broadcast-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where public.run_interval_broadcasts() > 0;
$cmd$);
