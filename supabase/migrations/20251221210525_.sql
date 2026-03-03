-- Enable pg_cron if not enabled
create extension if not exists pg_cron with schema extensions;

-- Schedule auto-archive to run daily at 3 AM UTC
-- This archives users who haven't logged in for 30+ days
select cron.schedule(
  'auto-archive-inactive-users',
  '0 3 * * *',
  $$select public.auto_archive_inactive_users();$$
);;
