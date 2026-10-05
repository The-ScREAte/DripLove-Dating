-- Admin push broadcasts: reliable delivery to everyone who can receive them.
--
-- Why campaigns stopped at 120: the queue fired 50 send calls at once, the
-- platform refused most of them ("Failed to send a request to the Edge
-- Function"), the self-continue step then failed the same way, and the
-- once-a-minute backup job that was meant to pick things up again was never
-- actually installed. The 2 Oct campaigns sent 120 of 5,056 / 1,918 and sat
-- in "processing" forever.
--
-- This migration:
--   * adds a 'broadcast' category to push_eligibility: everyone with a device
--     and notifications on (any activity level), but never at night in their
--     own time zone - those wait until 8am local - and at most 2 broadcasts
--     per person per 24h (extras wait, they are not dropped);
--   * lets a recipient be retried later (next_attempt_at) instead of failing;
--   * adds a small worker lock so overlapping runs can't double up;
--   * installs the missing once-a-minute queue job (only fires while a
--     campaign is actually in progress);
--   * cancels the two stalled 2 Oct campaigns rather than letting the new job
--     suddenly deliver 3-day-old promotions to ~5,000 people. They can be
--     re-sent from the admin screen.

-- 0. Campaign status / counts --------------------------------------------------

alter table public.broadcast_campaigns drop constraint if exists broadcast_campaigns_status_check;
alter table public.broadcast_campaigns add constraint broadcast_campaigns_status_check
  check (status = any (array['draft', 'queued', 'processing', 'completed', 'cancelled']));
-- skipped: no device / notifications off (they still get it in their in-app
-- inbox when saved to profiles). waiting: night-time in their time zone or
-- already had 2 broadcasts in 24h - will be sent automatically.
alter table public.broadcast_campaigns
  add column if not exists skipped_sends integer not null default 0,
  add column if not exists waiting_sends integer not null default 0;

-- 1. Retry-later support ------------------------------------------------------

alter table public.broadcast_recipients
  add column if not exists next_attempt_at timestamptz;

create index if not exists broadcast_recipients_claim_idx
  on public.broadcast_recipients (campaign_id, status, next_attempt_at);

create or replace function public.claim_broadcast_recipients(p_campaign_id uuid, p_batch_size integer, p_max_retries integer)
returns table(id uuid, user_id uuid, retry_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with to_claim as (
    select r.id
    from public.broadcast_recipients r
    where r.campaign_id = p_campaign_id
      and r.status = 'pending'
      and coalesce(r.retry_count, 0) < p_max_retries
      and (r.next_attempt_at is null or r.next_attempt_at <= now())
    order by r.created_at nulls last
    limit p_batch_size
    for update skip locked
  )
  update public.broadcast_recipients r
     set status = 'processing', processing_started_at = now()
    from to_claim
   where r.id = to_claim.id
  returning r.id, r.user_id, coalesce(r.retry_count, 0);
end;
$function$;

-- 2. Worker lock ----------------------------------------------------------------

create table if not exists public.background_worker_locks (
  name text primary key,
  locked_until timestamptz not null default now()
);
alter table public.background_worker_locks enable row level security;

create or replace function public.try_acquire_worker_lock(p_name text, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into public.background_worker_locks (name, locked_until)
  values (p_name, now() + make_interval(secs => p_seconds))
  on conflict (name) do update
    set locked_until = excluded.locked_until
    where public.background_worker_locks.locked_until < now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.release_worker_lock(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.background_worker_locks set locked_until = now() where name = p_name;
$$;

revoke all on function public.try_acquire_worker_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_worker_lock(text) from public, anon, authenticated;

-- 3. 'broadcast' category in the eligibility rules -----------------------------

create or replace function public.push_eligibility(p_user_id uuid, p_category text, p_kind text, p_dedupe_key text default null)
returns table (allowed boolean, reason text, tier text, local_hour integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text; v_permission text; v_tz text; v_country text; v_last timestamptz; v_tier text; v_hour integer;
  v_cat text := lower(coalesce(nullif(p_category, ''), 'engagement'));
  v_kind text := lower(coalesce(nullif(p_kind, ''), 'system'));
  v_quiet boolean; v_count integer; v_last_sent timestamptz;
begin
  select p.account_status, p.notification_permission, p.timezone, p.country_code
    into v_status, v_permission, v_tz, v_country
  from public.profiles p where p.id = p_user_id;
  if not found then
    return query select false, 'no_profile'::text, null::text, null::integer; return;
  end if;

  v_last := public.user_last_active_at(p_user_id);
  v_tier := case
    when v_last is null then 'dormant'
    when v_last > now() - interval '7 days' then 'active'
    when v_last > now() - interval '30 days' then 'lapsed'
    when v_last > now() - interval '60 days' then 'inactive'
    else 'dormant' end;

  begin
    v_hour := extract(hour from (now() at time zone public.user_timezone(v_tz, v_country)))::integer;
  exception when others then
    v_hour := extract(hour from (now() at time zone 'UTC'))::integer;
  end;
  v_quiet := v_hour >= 22 or v_hour < 8;

  if coalesce(v_status, 'active') <> 'active' then
    return query select false, 'account_not_active'::text, v_tier, v_hour; return; end if;
  if not exists (select 1 from public.push_tokens t where t.user_id = p_user_id) then
    return query select false, 'no_device'::text, v_tier, v_hour; return; end if;
  if v_permission = 'denied' then
    return query select false, 'notifications_off'::text, v_tier, v_hour; return; end if;
  if p_dedupe_key is not null and exists (
    select 1 from public.push_delivery_log l
    where l.user_id = p_user_id and l.dedupe_key = p_dedupe_key
      and l.decision = 'sent' and l.created_at > now() - interval '30 minutes') then
    return query select false, 'duplicate'::text, v_tier, v_hour; return; end if;

  if v_cat = 'transactional' then
    return query select true, 'transactional'::text, v_tier, v_hour; return; end if;

  -- Admin broadcasts: every activity level, daytime only, max 2 per 24h.
  if v_cat = 'broadcast' then
    if v_quiet then
      return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
    select count(*) into v_count from public.push_delivery_log l
    where l.user_id = p_user_id and l.category = 'broadcast' and l.decision = 'sent'
      and l.created_at > now() - interval '24 hours';
    if v_count >= 2 then
      return query select false, 'broadcast_cap'::text, v_tier, v_hour; return; end if;
    return query select true, 'broadcast'::text, v_tier, v_hour; return;
  end if;

  if v_cat = 'event' then
    if v_kind = 'like' then
      if v_tier <> 'active' then
        return query select false, 'like_person_not_active'::text, v_tier, v_hour; return; end if;
      if v_quiet then
        return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
      select max(l.created_at) into v_last_sent from public.push_delivery_log l
      where l.user_id = p_user_id and l.kind = 'like' and l.decision = 'sent';
      if v_last_sent > now() - interval '3 hours' then
        return query select false, 'like_grouped'::text, v_tier, v_hour; return; end if;
    end if;
    return query select true, 'event'::text, v_tier, v_hour; return;
  end if;

  if v_tier in ('inactive', 'dormant') then
    return query select false, 'inactive_no_engagement'::text, v_tier, v_hour; return; end if;
  if v_quiet then
    return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
  if v_tier = 'lapsed' then
    if exists (select 1 from public.push_delivery_log l
      where l.user_id = p_user_id and l.category = 'engagement' and l.decision = 'sent'
        and l.created_at > now() - interval '7 days') then
      return query select false, 'lapsed_weekly_cap'::text, v_tier, v_hour; return; end if;
    return query select true, 'engagement_lapsed'::text, v_tier, v_hour; return;
  end if;
  select count(*), max(l.created_at) into v_count, v_last_sent from public.push_delivery_log l
  where l.user_id = p_user_id and l.category = 'engagement' and l.decision = 'sent'
    and l.created_at > now() - interval '24 hours';
  if v_count >= 2 then
    return query select false, 'daily_cap'::text, v_tier, v_hour; return; end if;
  if v_last_sent > now() - interval '4 hours' then
    return query select false, 'too_soon'::text, v_tier, v_hour; return; end if;
  return query select true, 'engagement_active'::text, v_tier, v_hour;
end;
$$;

revoke all on function public.push_eligibility(uuid, text, text, text) from public, anon, authenticated;

-- 4. Stop the two stalled 2 Oct campaigns -------------------------------------

update public.broadcast_recipients
   set status = 'cancelled',
       error_message = 'Cancelled: campaign stalled before the delivery fix (resend from admin)',
       processing_started_at = null
 where status in ('pending', 'processing')
   and campaign_id in (
     select c.id from public.broadcast_campaigns c
     where c.status in ('queued', 'processing') and c.created_at < '2026-10-05'
   );

update public.broadcast_campaigns
   set status = 'cancelled'
 where status in ('queued', 'processing') and created_at < '2026-10-05';

-- 5. The missing once-a-minute queue job -----------------------------------------

select cron.unschedule('process-broadcast-queue')
where exists (select 1 from cron.job where jobname = 'process-broadcast-queue');
select cron.unschedule('process-broadcast-queue-every-minute')
where exists (select 1 from cron.job where jobname = 'process-broadcast-queue-every-minute');

select cron.schedule(
  'process-broadcast-queue-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-broadcast-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.broadcast_campaigns where status in ('queued', 'processing'));
  $cron$
);
