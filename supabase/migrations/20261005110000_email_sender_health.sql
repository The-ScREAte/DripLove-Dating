-- Email delivery: flag failing sending accounts, check them back in, resume.
--
-- What went wrong before: every SMTP reply starting with "5" was treated as
-- "this recipient's address is bad" - including Gmail's own
-- "550-5.4.5 Daily user sending limit exceeded", which is OUR account being
-- out of quota. Each time that happened, the customer being emailed was put
-- on the permanent do-not-send list. All 2,117 entries on that list came
-- from this, plus 1,903 queued emails marked failed.
--
-- Now (see supabase/functions/_shared/email-utils.ts):
--   * sender problems (sending limit, login rejected, account blocked,
--     connection) pause THAT sending account and keep the emails queued;
--   * only "address does not exist" (and unsubscribes) block a recipient;
--   * every 30 minutes, email-sender-health-check "pings" paused accounts
--     (logs in; for sending-limit pauses also sends one tiny test email to the
--     account itself). When an account works again it's un-paused and the
--     queued emails go out on the next queue run;
--   * every email goes through one queue (email_send_queue), sent in small
--     steady batches every 5 minutes instead of hundreds at once - bursts from
--     a Gmail account are a classic spam signal;
--   * every email carries a one-click unsubscribe (List-Unsubscribe header +
--     footer link), which Gmail and Yahoo expect from bulk senders.

-- 1. Sending-account health ----------------------------------------------------

create table if not exists public.email_sender_health (
  account_email text primary key,
  status text not null default 'active' check (status in ('active', 'paused')),
  pause_reason text,
  paused_at timestamptz,
  next_check_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  last_success_at timestamptz,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.email_sender_health enable row level security;

drop policy if exists "Admins can view email sender health" on public.email_sender_health;
create policy "Admins can view email sender health"
  on public.email_sender_health for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- 2. One queue for every email ---------------------------------------------------
-- kind 'broadcast': content comes from email_broadcast_history (broadcast_id).
-- kind 'notification': likes/matches digest; content is on the row itself.

alter table public.email_send_queue alter column broadcast_id drop not null;
alter table public.email_send_queue
  add column if not exists kind text not null default 'broadcast',
  add column if not exists priority integer not null default 5,
  add column if not exists user_id uuid,
  add column if not exists subject text,
  add column if not exists preheader text,
  add column if not exists html text,
  add column if not exists text_body text,
  add column if not exists account_email text,
  add column if not exists failure_type text,
  add column if not exists next_attempt_at timestamptz;

create index if not exists email_send_queue_due_idx
  on public.email_send_queue (priority, created_at)
  where status = 'pending';
create index if not exists email_send_queue_user_kind_idx
  on public.email_send_queue (user_id, kind, created_at desc)
  where user_id is not null;

-- 3. Do-not-send list: release the wrongly blocked (kept, not deleted) -----------

alter table public.email_suppression_list
  add column if not exists released_at timestamptz,
  add column if not exists released_reason text;

-- Undo with:
--   update email_suppression_list set released_at = null, released_reason = null
--    where released_reason = 'sender_quota_misclassified';
update public.email_suppression_list
   set released_at = now(), released_reason = 'sender_quota_misclassified'
 where released_at is null
   and (coalesce(last_error, '') ilike '%5.4.5%' or coalesce(last_error, '') ilike '%sending limit%');

-- Label the old failures correctly (they stay failed - they belong to
-- broadcasts from 31 Aug - 2 Oct; re-send from the admin screen if wanted).
update public.email_send_queue
   set failure_type = 'sender_quota'
 where status = 'failed'
   and (coalesce(error, '') ilike '%5.4.5%' or coalesce(error, '') ilike '%sending limit%');

-- 4. Unsubscribe links are signed with this (never leaves the server) -----------

insert into public.internal_secrets (key, value)
values ('email_unsubscribe_secret',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- 5. Schedules ---------------------------------------------------------------------

-- Send queued email every 5 minutes (small batches), only when something is due.
select cron.unschedule('process-email-queue-every-15-min')
where exists (select 1 from cron.job where jobname = 'process-email-queue-every-15-min');
select cron.unschedule('process-email-queue-every-5-min')
where exists (select 1 from cron.job where jobname = 'process-email-queue-every-5-min');
select cron.schedule(
  'process-email-queue-every-5-min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.email_send_queue
    where status = 'pending' and (next_attempt_at is null or next_attempt_at <= now())
  );
  $cron$
);

-- Ping paused sending accounts every 30 minutes (only when one is due).
select cron.unschedule('email-sender-health-check')
where exists (select 1 from cron.job where jobname = 'email-sender-health-check');
select cron.schedule(
  'email-sender-health-check',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/email-sender-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.email_sender_health
    where status = 'paused' and (next_check_at is null or next_check_at <= now())
  );
  $cron$
);
