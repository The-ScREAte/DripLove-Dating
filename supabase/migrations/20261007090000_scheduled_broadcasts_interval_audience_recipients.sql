-- Scheduled broadcasts: three new options.
--
--  * audience          - 'all' (default), 'free' or 'premium'. "Premium" means
--                        what the app grants right now (same rule as
--                        get_current_subscription_status).
--  * recipient_emails  - when set, only these accounts get the schedule.
--  * repeat_type 'interval' + interval_minutes - send every N minutes instead
--                        of once a day. Meant for testing on a hand-picked list
--                        of accounts, so it requires recipient_emails (1-50
--                        addresses) and can never reach everyone.
--
-- Interval schedules are sent by run_interval_broadcasts(), run every minute by
-- pg_cron. Each send is its own campaign (one per schedule per slot) and goes
-- through the normal queues: push via process-broadcast-queue, which emails
-- people a push can't reach, or email via process-email-queue. A slot that was
-- missed is skipped, not sent late. Daily/weekly schedules keep going through
-- process-scheduled-broadcasts, now with the audience and recipient filters.

alter table public.scheduled_broadcasts
  add column if not exists interval_minutes integer,
  add column if not exists audience text not null default 'all',
  add column if not exists recipient_emails text[];

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_repeat_type_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_repeat_type_check
  check (repeat_type = any (array['daily', 'every_2_days', 'weekends', 'weekdays', 'specific_day', 'interval']));

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_audience_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_audience_check
  check (audience in ('all', 'free', 'premium'));

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_interval_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_interval_check
  check (repeat_type <> 'interval' or (
    interval_minutes is not null and interval_minutes between 1 and 1440
    and recipient_emails is not null and cardinality(recipient_emails) between 1 and 50
  ));

-- One History entry per interval slot (daily schedules keep one per day).
alter table public.broadcast_campaigns add column if not exists occurrence_at timestamptz;
alter table public.email_broadcast_history add column if not exists occurrence_at timestamptz;

drop index if exists public.broadcast_campaigns_schedule_day_idx;
create unique index broadcast_campaigns_schedule_day_idx
  on public.broadcast_campaigns (scheduled_broadcast_id, occurrence_date)
  where scheduled_broadcast_id is not null and occurrence_at is null;
create unique index if not exists broadcast_campaigns_schedule_slot_idx
  on public.broadcast_campaigns (scheduled_broadcast_id, occurrence_at)
  where scheduled_broadcast_id is not null and occurrence_at is not null;

drop index if exists public.email_broadcast_history_schedule_day_idx;
create unique index email_broadcast_history_schedule_day_idx
  on public.email_broadcast_history (scheduled_broadcast_id, occurrence_date)
  where scheduled_broadcast_id is not null and occurrence_at is null;
create unique index if not exists email_broadcast_history_schedule_slot_idx
  on public.email_broadcast_history (scheduled_broadcast_id, occurrence_at)
  where scheduled_broadcast_id is not null and occurrence_at is not null;

-- Is this person premium right now? Same rule as get_current_subscription_status.
create or replace function public.user_is_premium_now(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select us.plan_name = 'premium'
       and us.status in ('active', 'cancelled', 'payment_pending')
       and (us.expires_at is null or us.expires_at > now() - interval '30 minutes')
    from public.user_subscriptions us
    where us.user_id = p_user_id
    order by us.created_at desc
    limit 1
  ), false);
$$;
revoke all on function public.user_is_premium_now(uuid) from public, anon, authenticated;

-- Does this person fit the schedule's audience and account list?
create or replace function public.schedule_targets_user(
  p_audience text, p_recipient_emails text[], p_user_id uuid, p_email text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select (p_recipient_emails is null or cardinality(p_recipient_emails) = 0
          or lower(trim(p_email)) in (select lower(trim(e)) from unnest(p_recipient_emails) e))
     and (coalesce(p_audience, 'all') = 'all'
          or public.user_is_premium_now(p_user_id) = (p_audience = 'premium'));
$$;
revoke all on function public.schedule_targets_user(text, text[], uuid, text) from public, anon, authenticated;

-- Daily/weekly schedules: as before, plus audience and account list.
-- Interval schedules are handled by run_interval_broadcasts().
create or replace function public.prepare_scheduled_broadcast(
  p_schedule_id uuid,
  p_ahead interval default '02:00:00'::interval,
  p_grace interval default '00:30:00'::interval
)
returns table(user_id uuid, email text, local_date date, send_at timestamp with time zone)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  s record;
  v_time time;
begin
  select * into s from public.scheduled_broadcasts b
  where b.id = p_schedule_id and b.is_active and b.repeat_type <> 'interval';
  if not found then return; end if;
  begin
    v_time := s.time_to_send::time;
  exception when others then
    return;
  end;

  return query
  with candidates as (
    select p.id as uid, lower(trim(p.email)) as addr,
           public.user_timezone(p.timezone, p.country_code) as tz
    from public.profiles p
    where coalesce(p.account_status, 'active') = 'active'
      and coalesce(p.is_admin, false) = false
      and (s.target_countries is null or cardinality(s.target_countries) = 0 or p.country = any (s.target_countries))
      and public.schedule_targets_user(s.audience, s.recipient_emails, p.id, p.email)
      and (
        (p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
         and not exists (select 1 from public.email_suppression_list x
                         where x.email = lower(trim(p.email)) and x.released_at is null))
        or (coalesce(s.channel, 'push') <> 'email'
            and exists (select 1 from public.push_tokens t where t.user_id = p.id)
            and coalesce(p.notification_permission, '') <> 'denied')
      )
  ),
  slots as (
    select c.uid, c.addr, d.day,
           ((d.day + v_time) at time zone c.tz) as at
    from candidates c
    cross join lateral (
      select ((now() at time zone c.tz)::date + k) as day from generate_series(-1, 1) k
    ) d
  ),
  due as (
    select sl.* from slots sl
    where sl.at between now() - p_grace and now() + p_ahead
      and public.schedule_runs_on(s.repeat_type, s.specific_day, (s.created_at at time zone 'UTC')::date, sl.day)
  ),
  ins as (
    insert into public.scheduled_broadcast_deliveries (schedule_id, user_id, local_date, send_at)
    select p_schedule_id, du.uid, du.day, du.at from due du
    on conflict do nothing
    returning scheduled_broadcast_deliveries.user_id as uid, scheduled_broadcast_deliveries.local_date as day,
              scheduled_broadcast_deliveries.send_at as at
  )
  select i.uid, du.addr, i.day, i.at
  from ins i join due du on du.uid = i.uid and du.day = i.day;
end;
$function$;

-- Every-N-minutes schedules. Slots run every interval_minutes from when the
-- schedule was created; each run sends the current slot if it hasn't been sent.
create or replace function public.run_interval_broadcasts()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  v_anchor timestamptz;
  v_step interval;
  v_slot timestamptz;
  v_ids uuid[];
  v_addrs text[];
  v_id uuid;
  v_sent integer := 0;
begin
  for s in
    select * from public.scheduled_broadcasts b
    where b.is_active and b.repeat_type = 'interval' and b.interval_minutes > 0
      and b.recipient_emails is not null and cardinality(b.recipient_emails) > 0
  loop
    begin
      v_anchor := date_trunc('minute', s.created_at);
      if now() < v_anchor then continue; end if;
      v_step := make_interval(mins => s.interval_minutes);
      v_slot := v_anchor + v_step * floor(extract(epoch from (now() - v_anchor)) / extract(epoch from v_step));

      select coalesce(array_agg(p.id), '{}'), coalesce(array_agg(lower(trim(p.email))), '{}')
        into v_ids, v_addrs
      from public.profiles p
      where coalesce(p.account_status, 'active') = 'active'
        and coalesce(p.is_admin, false) = false
        and (s.target_countries is null or cardinality(s.target_countries) = 0 or p.country = any (s.target_countries))
        and public.schedule_targets_user(s.audience, s.recipient_emails, p.id, p.email);
      if cardinality(v_ids) = 0 then continue; end if;

      v_id := null;
      if coalesce(s.channel, 'push') = 'email' then
        insert into public.email_broadcast_history
          (subject, message, recipient_count, successful_sends, failed_sends, status, recipient_filter,
           admin_id, target_countries, scheduled_broadcast_id, occurrence_date, occurrence_at)
        values
          (s.title, s.message, cardinality(v_addrs), 0, 0, 'partial', 'scheduled',
           s.admin_id, nullif(s.target_countries, '{}'), s.id, (v_slot at time zone 'UTC')::date, v_slot)
        on conflict do nothing
        returning id into v_id;
        if v_id is null then continue; end if;

        insert into public.email_send_queue (broadcast_id, recipient, kind, priority, attempt_count, next_attempt_at)
        select v_id, a, 'broadcast', 3, 0, now()
        from unnest(v_addrs) a
        where a ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
      else
        insert into public.broadcast_campaigns
          (title, message, notification_type, total_recipients, successful_sends, failed_sends, status,
           save_to_profile, admin_id, target_countries, scheduled_broadcast_id, occurrence_date, occurrence_at)
        values
          (s.title, s.message, 'system', cardinality(v_ids), 0, 0, 'queued',
           true, s.admin_id, nullif(s.target_countries, '{}'), s.id, (v_slot at time zone 'UTC')::date, v_slot)
        on conflict do nothing
        returning id into v_id;
        if v_id is null then continue; end if;

        -- process-broadcast-queue (every minute) pushes these, and emails
        -- anyone a push can't reach.
        insert into public.broadcast_recipients (campaign_id, user_id, status, retry_count, next_attempt_at)
        select v_id, u, 'pending', 0, now() from unnest(v_ids) u;
      end if;

      update public.scheduled_broadcasts
         set last_sent_at = now(), total_sends = coalesce(total_sends, 0) + 1, next_send_at = v_slot + v_step
       where id = s.id;
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'run_interval_broadcasts: schedule % failed: %', s.id, sqlerrm;
    end;
  end loop;
  return v_sent;
end;
$function$;
revoke all on function public.run_interval_broadcasts() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'run-interval-broadcasts';
select cron.schedule('run-interval-broadcasts', '* * * * *', 'select public.run_interval_broadcasts();');
