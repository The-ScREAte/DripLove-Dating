-- Scheduled broadcasts, part 2.
--
--  * send_times     - one or more local times a day (e.g. 09:00 and 19:00), so a
--                     day's messages are spread out instead of sent at once.
--                     time_to_send stays as the first time for older screens.
--  * every_n_days   - repeat_type 'every_n_days': every 2-30 days ('every_2_days'
--                     rows move to it; the old value is still accepted).
--  * specific_days  - repeat_type 'specific_day' can now pick several weekdays.
--  * Intervals      - every N minutes or hours (up to 24h). Under an hour still
--                     needs an explicit list of 1-50 accounts. Hourly schedules
--                     can go to a whole audience; they reach only people we can
--                     actually reach and skip anyone whose local time is
--                     22:00-08:00. Listed test accounts get every slot.
--  * Fair order     - who gets a send first is shuffled every time: pushes are
--                     claimed in random order within each minute, and the email
--                     queue (see process-email-queue) sends by due time with a
--                     random tiebreak, so when a sending limit is reached it isn't
--                     always the same people who wait.

-- 1) Schedule options ---------------------------------------------------------
alter table public.scheduled_broadcasts
  add column if not exists send_times text[],
  add column if not exists every_n_days integer,
  add column if not exists specific_days text[];

update public.scheduled_broadcasts set send_times = array[time_to_send]
 where send_times is null and time_to_send is not null and repeat_type <> 'interval';
update public.scheduled_broadcasts set specific_days = array[specific_day]
 where specific_days is null and specific_day is not null;
update public.scheduled_broadcasts set repeat_type = 'every_n_days', every_n_days = 2
 where repeat_type = 'every_2_days';

create or replace function public.valid_send_times(p_times text[])
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(bool_and(t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), false) from unnest(p_times) t;
$$;

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_repeat_type_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_repeat_type_check
  check (repeat_type = any (array['daily', 'every_2_days', 'every_n_days', 'weekdays', 'weekends', 'specific_day', 'interval']));

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_send_times_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_send_times_check
  check (send_times is null or (cardinality(send_times) between 1 and 6 and public.valid_send_times(send_times)));

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_every_n_days_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_every_n_days_check
  check (repeat_type <> 'every_n_days' or (every_n_days is not null and every_n_days between 2 and 30));

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_specific_days_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_specific_days_check
  check ((specific_days is null or specific_days <@ array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
     and (repeat_type <> 'specific_day' or coalesce(cardinality(specific_days), 0) > 0 or specific_day is not null));

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_interval_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_interval_check
  check (repeat_type <> 'interval' or (
    interval_minutes is not null and interval_minutes between 1 and 1440
    and (interval_minutes >= 60 or (recipient_emails is not null and cardinality(recipient_emails) between 1 and 50))
  ));

-- 2) One delivery, and one History entry, per day per send time --------------
alter table public.scheduled_broadcast_deliveries add column if not exists send_time text not null default '';
alter table public.scheduled_broadcast_deliveries drop constraint if exists scheduled_broadcast_deliveries_pkey;
alter table public.scheduled_broadcast_deliveries
  add constraint scheduled_broadcast_deliveries_pkey primary key (schedule_id, user_id, local_date, send_time);

alter table public.broadcast_campaigns add column if not exists occurrence_time text;
alter table public.email_broadcast_history add column if not exists occurrence_time text;

drop index if exists public.broadcast_campaigns_schedule_day_idx;
create unique index broadcast_campaigns_schedule_day_idx
  on public.broadcast_campaigns (scheduled_broadcast_id, occurrence_date, coalesce(occurrence_time, ''))
  where scheduled_broadcast_id is not null and occurrence_at is null;

drop index if exists public.email_broadcast_history_schedule_day_idx;
create unique index email_broadcast_history_schedule_day_idx
  on public.email_broadcast_history (scheduled_broadcast_id, occurrence_date, coalesce(occurrence_time, ''))
  where scheduled_broadcast_id is not null and occurrence_at is null;

-- 3) Which days a schedule runs on -------------------------------------------
create or replace function public.schedule_runs_on(
  p_repeat text, p_days text[], p_every_n_days integer, p_anchor date, p_day date
)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select case p_repeat
    when 'daily' then true
    when 'every_2_days' then p_day >= p_anchor and ((p_day - p_anchor) % 2) = 0
    when 'every_n_days' then p_day >= p_anchor and ((p_day - p_anchor) % greatest(coalesce(p_every_n_days, 2), 1)) = 0
    when 'weekdays' then extract(isodow from p_day) between 1 and 5
    when 'weekends' then extract(isodow from p_day) in (6, 7)
    when 'specific_day' then to_char(p_day, 'FMday') = any (coalesce(p_days, '{}'))
    else false
  end;
$$;
drop function if exists public.schedule_runs_on(text, text, date, date);

-- Plain (invoker) functions so they can be inlined; only server-side schedule
-- functions call them.
create or replace function public.user_is_premium_now(p_user_id uuid)
returns boolean
language sql
stable
security invoker
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

create or replace function public.schedule_targets_user(
  p_audience text, p_recipient_emails text[], p_user_id uuid, p_email text
)
returns boolean
language sql
stable
security invoker
set search_path to ''
as $$
  select (p_recipient_emails is null or cardinality(p_recipient_emails) = 0
          or lower(trim(p_email)) in (select lower(trim(e)) from unnest(p_recipient_emails) e))
     and (coalesce(p_audience, 'all') = 'all'
          or public.user_is_premium_now(p_user_id) = (p_audience = 'premium'));
$$;
revoke all on function public.schedule_targets_user(text, text[], uuid, text) from public, anon, authenticated;

-- 4) Daily/weekly schedules: every send time, each in the person's local time --
drop function if exists public.prepare_scheduled_broadcast(uuid, interval, interval);
create function public.prepare_scheduled_broadcast(
  p_schedule_id uuid,
  p_ahead interval default '02:00:00'::interval,
  p_grace interval default '00:30:00'::interval
)
returns table(user_id uuid, email text, local_date date, send_time text, send_at timestamp with time zone)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  s record;
  v_times text[];
begin
  select * into s from public.scheduled_broadcasts b
  where b.id = p_schedule_id and b.is_active and b.repeat_type <> 'interval';
  if not found then return; end if;

  select coalesce(array_agg(distinct t), '{}') into v_times
  from unnest(coalesce(nullif(s.send_times, '{}'), array[s.time_to_send])) t
  where t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  if cardinality(v_times) = 0 then return; end if;

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
    select c.uid, c.addr, d.day, tm.t as slot_time,
           ((d.day + tm.t::time) at time zone c.tz) as at
    from candidates c
    cross join lateral (
      select ((now() at time zone c.tz)::date + k) as day from generate_series(-1, 1) k
    ) d
    cross join unnest(v_times) as tm(t)
  ),
  due as (
    select sl.* from slots sl
    where sl.at between now() - p_grace and now() + p_ahead
      and public.schedule_runs_on(s.repeat_type, coalesce(nullif(s.specific_days, '{}'), array[s.specific_day]),
                                  s.every_n_days, (s.created_at at time zone 'UTC')::date, sl.day)
  ),
  ins as (
    insert into public.scheduled_broadcast_deliveries (schedule_id, user_id, local_date, send_time, send_at)
    select p_schedule_id, du.uid, du.day, du.slot_time, du.at from due du
    on conflict do nothing
    returning scheduled_broadcast_deliveries.user_id as uid, scheduled_broadcast_deliveries.local_date as day,
              scheduled_broadcast_deliveries.send_time as tm, scheduled_broadcast_deliveries.send_at as at
  )
  select i.uid, du.addr, i.day, i.tm, i.at
  from ins i join due du on du.uid = i.uid and du.day = i.day and du.slot_time = i.tm;
end;
$function$;
revoke all on function public.prepare_scheduled_broadcast(uuid, interval, interval) from public, anon, authenticated;
grant execute on function public.prepare_scheduled_broadcast(uuid, interval, interval) to service_role;

-- 5) Interval schedules (minutes/hours) --------------------------------------
create or replace function public.run_interval_broadcasts()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  v_listed boolean;
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
  loop
    begin
      v_listed := s.recipient_emails is not null and cardinality(s.recipient_emails) > 0;
      -- Under an hour is for listed test accounts only (the table enforces it too).
      if s.interval_minutes < 60 and not v_listed then continue; end if;

      v_anchor := date_trunc('minute', s.created_at);
      if now() < v_anchor then continue; end if;
      v_step := make_interval(mins => s.interval_minutes);
      v_slot := v_anchor + v_step * floor(extract(epoch from (now() - v_anchor)) / extract(epoch from v_step));

      -- Already sent this slot? Skip the recipient lookup entirely.
      if exists (select 1 from public.broadcast_campaigns c where c.scheduled_broadcast_id = s.id and c.occurrence_at = v_slot)
         or exists (select 1 from public.email_broadcast_history h where h.scheduled_broadcast_id = s.id and h.occurrence_at = v_slot) then
        continue;
      end if;

      select coalesce(array_agg(p.id), '{}'), coalesce(array_agg(lower(trim(p.email))), '{}')
        into v_ids, v_addrs
      from public.profiles p
      where coalesce(p.account_status, 'active') = 'active'
        and coalesce(p.is_admin, false) = false
        and (s.target_countries is null or cardinality(s.target_countries) = 0 or p.country = any (s.target_countries))
        and public.schedule_targets_user(s.audience, s.recipient_emails, p.id, p.email)
        and (v_listed or (
          extract(hour from (now() at time zone public.user_timezone(p.timezone, p.country_code))) between 8 and 21
          and (
            (p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
             and not exists (select 1 from public.email_suppression_list x
                             where x.email = lower(trim(p.email)) and x.released_at is null))
            or (coalesce(s.channel, 'push') <> 'email'
                and exists (select 1 from public.push_tokens t where t.user_id = p.id)
                and coalesce(p.notification_permission, '') <> 'denied')
          )
        ));
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

-- 6) Fair push order: random within each minute, not always the same people first.
create or replace function public.claim_broadcast_recipients(p_campaign_id uuid, p_batch_size integer, p_max_retries integer)
returns table(id uuid, user_id uuid, retry_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with to_claim as (
    select r.id from public.broadcast_recipients r
    where r.campaign_id = p_campaign_id
      and r.status = 'pending'
      and coalesce(r.retry_count, 0) < p_max_retries
      and (r.next_attempt_at is null or r.next_attempt_at <= now())
    -- Earliest due first; within the same minute, random (ids are random UUIDs,
    -- new for every send).
    order by date_trunc('minute', coalesce(r.next_attempt_at, r.created_at)), r.id
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

-- 7) Fair email order (process-email-queue): due time first, random tiebreak.
create index if not exists email_send_queue_fair_idx
  on public.email_send_queue (priority, next_attempt_at nulls first, id)
  where status = 'pending';
