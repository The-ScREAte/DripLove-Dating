-- Schedule subscription expiry processing via pg_cron (no HTTP calls)
-- This avoids relying on net.http_post + embedded keys and keeps expiry handling fully server-side.

-- Ensure pg_cron is available
create extension if not exists pg_cron;

-- Remove the older HTTP-based scheduler if present
select cron.unschedule('subscription-checker-hourly');

-- Schedule the pure-SQL expiry handler to run hourly
select cron.schedule(
  'subscription-expiry-hourly-sql',
  '0 * * * *',
  $$select public.handle_subscription_expiry();$$
);
