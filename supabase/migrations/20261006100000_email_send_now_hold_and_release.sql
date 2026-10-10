-- Email: send the moment it's due, deliver everything, hold & release
-- addresses that fail.
--
-- 1) info@driplove.love (Private Email) sends everything, with no daily cap;
--    the Gmail accounts are only backups (process-email-queue).
-- 2) A new email starts sending straight away (trigger below) instead of
--    waiting for the 5-minute run; the queue schedule now runs every minute so
--    scheduled emails go out at their time, and the scheduler lines them up
--    every 5 minutes instead of 15.
-- 3) Scheduled emails are never dropped for being late any more (expires_at).
-- 4) An address that fails is put on hold instead of being dropped: its
--    emails wait (status 'held'), it's checked again later with growing gaps
--    (email-sender-health-check), and once it looks reachable it's released
--    and its emails go back in the queue. Bounces that come back to the
--    sending mailboxes count as failures too (process-email-bounces).
--    Unsubscribes are never undone automatically.

-- 1. Queue rows can wait on hold ---------------------------------------------------

alter table public.email_send_queue drop constraint if exists email_send_queue_status_check;
alter table public.email_send_queue
  add constraint email_send_queue_status_check check (status in ('pending', 'sent', 'failed', 'held'));

create index if not exists email_send_queue_recipient_idx
  on public.email_send_queue (lower(trim(recipient)), created_at desc);

-- Nothing is dropped for being late any more.
update public.email_send_queue set expires_at = null where status = 'pending' and expires_at is not null;
comment on column public.email_send_queue.expires_at is 'Unused since 2026-10-06: scheduled emails are always delivered.';

-- 2. Addresses on hold: when to check them again -------------------------------------

alter table public.email_suppression_list
  add column if not exists failure_count integer not null default 1,
  add column if not exists next_check_at timestamptz,
  add column if not exists last_checked_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.email_suppression_list
   set next_check_at = now()
 where released_at is null and reason <> 'unsubscribed' and next_check_at is null;

create index if not exists email_suppression_list_due_idx
  on public.email_suppression_list (next_check_at)
  where released_at is null and reason <> 'unsubscribed';

-- Gap before the next check: an address that doesn't exist is checked rarely
-- (1 day, 3 days, 1 week, 2 weeks, then monthly); anything else sooner
-- (1 hour, 6 hours, 1 day, 3 days, 1 week, 2 weeks, then monthly).
create or replace function public.email_recheck_gap(p_reason text, p_failures integer)
returns interval
language sql immutable set search_path = '' as $$
  select make_interval(hours => case
    when p_reason = 'hard_bounce'
      then (array[24, 72, 168, 336, 720])[least(greatest(coalesce(p_failures, 1), 1), 5)]
    else (array[1, 6, 24, 72, 168, 336, 720])[least(greatest(coalesce(p_failures, 1), 1), 7)]
  end);
$$;

-- Starts process-email-queue now.
create or replace function public.start_email_queue()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.start_email_queue() from public, anon, authenticated;

-- Emails that waited on hold for over 2 weeks are too old to send now.
create or replace function public.expire_old_held_emails(p_email text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_broadcasts uuid[];
  v_count integer;
begin
  with gone as (
    update public.email_send_queue q
       set status = 'failed', failure_type = 'suppressed',
           error = 'Not sent: the address kept failing for over 2 weeks'
     where lower(trim(q.recipient)) = v_email and q.status = 'held'
       and q.created_at < now() - interval '14 days'
    returning q.broadcast_id
  ), per_broadcast as (
    select broadcast_id, count(*) as n from gone where broadcast_id is not null group by broadcast_id
  ), bumped as (
    update public.email_broadcast_history h
       set failed_sends = coalesce(h.failed_sends, 0) + pb.n
      from per_broadcast pb
     where h.id = pb.broadcast_id
    returning h.id
  )
  select coalesce(array_agg(id), '{}'), (select count(*) from gone) into v_broadcasts, v_count from bumped;

  update public.email_broadcast_history h
     set status = 'completed'
   where h.id = any (v_broadcasts)
     and not exists (select 1 from public.email_send_queue w
                      where w.broadcast_id = h.id and w.status in ('pending', 'held'));
  return v_count;
end;
$$;
revoke all on function public.expire_old_held_emails(text) from public, anon, authenticated;

-- Put an address on hold, with every email still waiting for it.
create or replace function public.hold_email_recipient(p_email text, p_reason text, p_error text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_prev public.email_suppression_list%rowtype;
  v_exists boolean;
  v_failures integer;
begin
  select * into v_prev from public.email_suppression_list where email = v_email for update;
  v_exists := found;

  if v_exists and v_prev.released_at is null then
    -- Already on hold (or unsubscribed): keep its schedule, note the error.
    update public.email_suppression_list
       set last_error = coalesce(p_error, last_error), updated_at = now()
     where email = v_email;
    if v_prev.reason = 'unsubscribed' then return; end if;
  else
    v_failures := case
      when not v_exists then 1
      -- Worked fine for a month since it was last released: start over.
      when v_prev.released_at < now() - interval '30 days' then 1
      else coalesce(v_prev.failure_count, 0) + 1
    end;
    insert into public.email_suppression_list
      (email, reason, last_error, created_at, released_at, released_reason,
       failure_count, next_check_at, last_checked_at, updated_at)
    values
      (v_email, p_reason, p_error, now(), null, null,
       v_failures, now() + public.email_recheck_gap(p_reason, v_failures), null, now())
    on conflict (email) do update
      set reason = excluded.reason, last_error = excluded.last_error, created_at = now(),
          released_at = null, released_reason = null, failure_count = excluded.failure_count,
          next_check_at = excluded.next_check_at, updated_at = now();
  end if;

  update public.email_send_queue
     set status = 'held', failure_type = 'suppressed', error = coalesce(p_error, 'On hold: the address failed')
   where lower(trim(recipient)) = v_email and status = 'pending';
end;
$$;
revoke all on function public.hold_email_recipient(text, text, text) from public, anon, authenticated;

-- A check found the address still unreachable: try again later.
create or replace function public.email_recheck_failed(p_email text, p_error text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
begin
  update public.email_suppression_list
     set failure_count = failure_count + 1,
         next_check_at = now() + public.email_recheck_gap(reason, failure_count + 1),
         last_checked_at = now(), last_error = coalesce(p_error, last_error), updated_at = now()
   where email = v_email and released_at is null and reason <> 'unsubscribed';
  perform public.expire_old_held_emails(v_email);
end;
$$;
revoke all on function public.email_recheck_failed(text, text) from public, anon, authenticated;

-- The address works again: back in the queue. The newest email goes straight
-- away as the real test; the rest follow 20 minutes later, so a bounce on the
-- first one (process-email-bounces) puts them back on hold before they go.
create or replace function public.release_email_suppression(p_email text, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_newest uuid;
  v_count integer;
begin
  update public.email_suppression_list
     set released_at = now(), released_reason = p_reason, last_checked_at = now(),
         next_check_at = null, updated_at = now()
   where email = v_email and released_at is null;

  perform public.expire_old_held_emails(v_email);

  select q.id into v_newest from public.email_send_queue q
   where lower(trim(q.recipient)) = v_email and q.status = 'held'
   order by q.created_at desc limit 1;

  update public.email_send_queue
     set status = 'pending', failure_type = 'released', error = null, attempt_count = 0,
         next_attempt_at = case when id = v_newest then null else now() + interval '20 minutes' end
   where lower(trim(recipient)) = v_email and status = 'held';
  get diagnostics v_count = row_count;

  if v_count > 0 then perform public.start_email_queue(); end if;
  return v_count;
end;
$$;
revoke all on function public.release_email_suppression(text, text) from public, anon, authenticated;

-- A bounce came back: the bounced email waits with the address.
create or replace function public.record_email_bounce(p_email text, p_reason text, p_error text, p_account_email text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_row record;
begin
  select q.id, q.broadcast_id into v_row
    from public.email_send_queue q
   where lower(trim(q.recipient)) = v_email and q.status = 'sent'
     and q.sent_at > now() - interval '3 days'
     and (p_account_email is null or q.account_email = p_account_email)
   order by q.sent_at desc
   limit 1;
  if found then
    update public.email_send_queue
       set status = 'held', failure_type = 'bounced', error = p_error
     where id = v_row.id;
    if v_row.broadcast_id is not null then
      update public.email_broadcast_history
         set successful_sends = greatest(coalesce(successful_sends, 0) - 1, 0), status = 'partial'
       where id = v_row.broadcast_id;
    end if;
  end if;
  perform public.hold_email_recipient(v_email, p_reason, p_error);
end;
$$;
revoke all on function public.record_email_bounce(text, text, text, text) from public, anon, authenticated;

-- Admin "Retry" on the Suppressed screen: release now (record kept).
create or replace function public.remove_email_suppression(target_email text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Unauthorized: Admin access required';
  end if;
  perform public.release_email_suppression(target_email, 'admin');
  return true;
end;
$$;

-- NOT APPLIED YET (declined 2026-10-10). Trimmed on 2026-10-10 to what is
-- safe to apply on top of the current system. Left out of the original
-- draft: the bounce-mailbox reader (its process-email-bounces function was
-- never deployed), an older copy of prepare_scheduled_broadcast (superseded by
-- 20261009150000_daily_push_rhythm.sql) and running process-scheduled-broadcasts
-- every 5 minutes (it stays every 15).

-- 4. New email -> start sending now -------------------------------------------------

create or replace function public.email_send_queue_start_on_insert()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from new_rows r
              where r.status = 'pending' and (r.next_attempt_at is null or r.next_attempt_at <= now())) then
    perform public.start_email_queue();
  end if;
  return null;
end;
$$;
revoke all on function public.email_send_queue_start_on_insert() from public, anon, authenticated;

drop trigger if exists email_send_queue_start_on_insert on public.email_send_queue;
create trigger email_send_queue_start_on_insert
  after insert on public.email_send_queue
  referencing new table as new_rows
  for each statement execute function public.email_send_queue_start_on_insert();

-- 5. Schedules ---------------------------------------------------------------------

-- Queue: every minute (safety net; new emails start a run themselves), only
-- when something is due - scheduled emails go out within the minute.
select cron.unschedule('process-email-queue-every-5-min')
where exists (select 1 from cron.job where jobname = 'process-email-queue-every-5-min');
select cron.unschedule('process-email-queue-every-minute')
where exists (select 1 from cron.job where jobname = 'process-email-queue-every-minute');
select cron.schedule(
  'process-email-queue-every-minute',
  '* * * * *',
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

-- Health check: paused sending accounts and addresses on hold, every 5
-- minutes, only when one is due.
select cron.unschedule('email-sender-health-check')
where exists (select 1 from cron.job where jobname = 'email-sender-health-check');
select cron.schedule(
  'email-sender-health-check',
  '*/5 * * * *',
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
  ) or exists (
    select 1 from public.email_suppression_list
    where released_at is null and reason <> 'unsubscribed' and next_check_at <= now()
  );
  $cron$
);
