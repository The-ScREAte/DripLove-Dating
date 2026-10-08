-- Scheduled broadcasts, part 3.
--
--  * starts_at / ends_at - optional window. Nothing is sent before starts_at;
--    at ends_at the schedule switches itself off. Interval schedules count their
--    slots from starts_at (it was created_at).
--  * create_schedule_send() - the one place a send is created (interval slots
--    and "Send now"): picks the audience, writes the History entry and the queue
--    rows, and starts the right worker straight away.
--  * send_schedule_now(), preview_schedule_audience(), admin_country_counts() -
--    admin screen helpers. The country list used to download every profile.

alter table public.scheduled_broadcasts
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

update public.scheduled_broadcasts set starts_at = created_at
 where repeat_type = 'interval' and starts_at is null;

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_window_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_window_check
  check (ends_at is null or starts_at is null or ends_at > starts_at);

-- Start a notification worker now (the same call its cron job makes). pg_net
-- sends it after this transaction commits, so the worker sees the new rows.
create or replace function public.kick_notification_worker(p_function text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_function not in ('process-broadcast-queue', 'process-email-queue') then
    raise exception 'Unknown worker %', p_function;
  end if;
  perform net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.kick_notification_worker(text) from public, anon, authenticated;

-- Everyone a schedule's audience settings match right now, and how we can reach them.
create or replace function public.schedule_audience(
  p_audience text, p_recipient_emails text[], p_target_countries text[], p_skip_night boolean
)
returns table(user_id uuid, email text, has_device boolean, can_email boolean)
language sql
stable
security invoker
set search_path to ''
as $$
  select p.id,
         lower(trim(p.email)),
         exists (select 1 from public.push_tokens t where t.user_id = p.id)
           and coalesce(p.notification_permission, '') <> 'denied',
         coalesce(p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$', false)
           and not exists (select 1 from public.email_suppression_list x
                           where x.email = lower(trim(p.email)) and x.released_at is null)
  from public.profiles p
  where coalesce(p.account_status, 'active') = 'active'
    and coalesce(p.is_admin, false) = false
    and (p_target_countries is null or cardinality(p_target_countries) = 0 or p.country = any (p_target_countries))
    and public.schedule_targets_user(p_audience, p_recipient_emails, p.id, p.email)
    and (not p_skip_night
         or extract(hour from (now() at time zone public.user_timezone(p.timezone, p.country_code))) between 8 and 21);
$$;
revoke all on function public.schedule_audience(text, text[], text[], boolean) from public, anon, authenticated;

-- Create one send of a schedule for slot p_slot. Returns how many people it
-- went to (0 = nobody to send to, or this slot was already sent).
create or replace function public.create_schedule_send(
  p_schedule_id uuid, p_slot timestamptz, p_skip_night boolean, p_kick boolean
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  v_listed boolean;
  v_email_channel boolean;
  v_ids uuid[];
  v_addrs text[];
  v_id uuid;
  v_count integer;
begin
  select * into s from public.scheduled_broadcasts b where b.id = p_schedule_id;
  if not found then return 0; end if;
  v_listed := coalesce(cardinality(s.recipient_emails), 0) > 0;
  v_email_channel := coalesce(s.channel, 'push') = 'email';

  -- Listed (test) accounts always get it - in their in-app inbox at least.
  -- Otherwise only people we can actually reach.
  select coalesce(array_agg(a.user_id), '{}'),
         coalesce(array_agg(a.email) filter (where a.can_email), '{}')
    into v_ids, v_addrs
  from public.schedule_audience(s.audience, s.recipient_emails, s.target_countries, p_skip_night) a
  where v_listed or a.can_email or (not v_email_channel and a.has_device);

  v_count := case when v_email_channel then cardinality(v_addrs) else cardinality(v_ids) end;
  if v_count = 0 then return 0; end if;

  if v_email_channel then
    insert into public.email_broadcast_history
      (subject, message, recipient_count, successful_sends, failed_sends, status, recipient_filter,
       admin_id, target_countries, scheduled_broadcast_id, occurrence_date, occurrence_at)
    values
      (s.title, s.message, v_count, 0, 0, 'partial', 'scheduled',
       s.admin_id, nullif(s.target_countries, '{}'), s.id, (p_slot at time zone 'UTC')::date, p_slot)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then return 0; end if;

    insert into public.email_send_queue (broadcast_id, recipient, kind, priority, attempt_count, next_attempt_at)
    select v_id, a, 'broadcast', 3, 0, now() from unnest(v_addrs) a;
  else
    insert into public.broadcast_campaigns
      (title, message, notification_type, total_recipients, successful_sends, failed_sends, status,
       save_to_profile, admin_id, target_countries, scheduled_broadcast_id, occurrence_date, occurrence_at)
    values
      (s.title, s.message, 'system', v_count, 0, 0, 'queued',
       true, s.admin_id, nullif(s.target_countries, '{}'), s.id, (p_slot at time zone 'UTC')::date, p_slot)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then return 0; end if;

    -- process-broadcast-queue pushes these and emails anyone a push can't reach.
    insert into public.broadcast_recipients (campaign_id, user_id, status, retry_count, next_attempt_at)
    select v_id, u, 'pending', 0, now() from unnest(v_ids) u;
  end if;

  update public.scheduled_broadcasts
     set last_sent_at = now(), total_sends = coalesce(total_sends, 0) + 1
   where id = s.id;

  if p_kick then
    perform public.kick_notification_worker(
      case when v_email_channel then 'process-email-queue' else 'process-broadcast-queue' end);
  end if;
  return v_count;
end;
$function$;
revoke all on function public.create_schedule_send(uuid, timestamptz, boolean, boolean) from public, anon, authenticated;

-- Every-N-minutes/hours schedules, run every minute by pg_cron.
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
  v_push boolean := false;
  v_email boolean := false;
  v_sent integer := 0;
begin
  -- Schedules past their end switch themselves off.
  update public.scheduled_broadcasts set is_active = false
   where is_active and ends_at is not null and ends_at <= now();

  for s in
    select * from public.scheduled_broadcasts b
    where b.is_active and b.repeat_type = 'interval' and b.interval_minutes > 0
  loop
    begin
      v_listed := coalesce(cardinality(s.recipient_emails), 0) > 0;
      -- Under an hour is for listed test accounts only (the table enforces it too).
      if s.interval_minutes < 60 and not v_listed then continue; end if;

      v_anchor := date_trunc('minute', coalesce(s.starts_at, s.created_at));
      if now() < v_anchor then continue; end if;
      v_step := make_interval(mins => s.interval_minutes);
      v_slot := v_anchor + v_step * floor(extract(epoch from (now() - v_anchor)) / extract(epoch from v_step));

      -- Already sent this slot? Skip the audience lookup entirely.
      if exists (select 1 from public.broadcast_campaigns c where c.scheduled_broadcast_id = s.id and c.occurrence_at = v_slot)
         or exists (select 1 from public.email_broadcast_history h where h.scheduled_broadcast_id = s.id and h.occurrence_at = v_slot) then
        continue;
      end if;

      -- Whole audiences skip people's night (22:00-08:00); listed accounts get every slot.
      if public.create_schedule_send(s.id, v_slot, not v_listed, false) > 0 then
        update public.scheduled_broadcasts set next_send_at = v_slot + v_step where id = s.id;
        if coalesce(s.channel, 'push') = 'email' then v_email := true; else v_push := true; end if;
        v_sent := v_sent + 1;
      end if;
    exception when others then
      raise warning 'run_interval_broadcasts: schedule % failed: %', s.id, sqlerrm;
    end;
  end loop;

  -- One start per worker per run, after every send is written.
  if v_push then perform public.kick_notification_worker('process-broadcast-queue'); end if;
  if v_email then perform public.kick_notification_worker('process-email-queue'); end if;
  return v_sent;
end;
$function$;
revoke all on function public.run_interval_broadcasts() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'run-interval-broadcasts';
select cron.schedule('run-interval-broadcasts', '* * * * *', 'select public.run_interval_broadcasts();');

-- Daily/weekly schedules respect the window too.
create or replace function public.prepare_scheduled_broadcast(
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
    select a.user_id as uid, a.email as addr,
           public.user_timezone(p.timezone, p.country_code) as tz
    from public.schedule_audience(s.audience, s.recipient_emails, s.target_countries, false) a
    join public.profiles p on p.id = a.user_id
    where a.can_email or (coalesce(s.channel, 'push') <> 'email' and a.has_device)
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
      and (s.starts_at is null or sl.at >= s.starts_at)
      and (s.ends_at is null or sl.at < s.ends_at)
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

-- Admin screen helpers ---------------------------------------------------------
create or replace function public.send_schedule_now(p_schedule_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  return public.create_schedule_send(p_schedule_id, now(), false, true);
end;
$$;
revoke all on function public.send_schedule_now(uuid) from public, anon;
grant execute on function public.send_schedule_now(uuid) to authenticated;

create or replace function public.preview_schedule_audience(
  p_channel text, p_audience text, p_recipient_emails text[], p_target_countries text[]
)
returns table(matched integer, by_push integer, by_email integer, unreachable integer)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  return query
  select count(*)::integer,
         count(*) filter (where p_channel <> 'email' and a.has_device)::integer,
         count(*) filter (where a.can_email and (p_channel = 'email' or not a.has_device))::integer,
         count(*) filter (where not a.can_email and (p_channel = 'email' or not a.has_device))::integer
  from public.schedule_audience(p_audience, nullif(p_recipient_emails, '{}'), nullif(p_target_countries, '{}'), false) a;
end;
$$;
revoke all on function public.preview_schedule_audience(text, text, text[], text[]) from public, anon;
grant execute on function public.preview_schedule_audience(text, text, text[], text[]) to authenticated;

create or replace function public.admin_country_counts()
returns table(country text, users integer)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  return query
  select p.country, count(*)::integer
  from public.profiles p
  where p.country is not null and p.account_status = 'active' and coalesce(p.is_admin, false) = false
  group by p.country
  order by 2 desc;
end;
$$;
revoke all on function public.admin_country_counts() from public, anon;
grant execute on function public.admin_country_counts() to authenticated;

-- schedule_audience as one query: the per-row helper calls (functions with a
-- SET clause are never inlined) took ~1s for 5,000 people; a join takes ms.
create or replace function public.schedule_audience(
  p_audience text, p_recipient_emails text[], p_target_countries text[], p_skip_night boolean
)
returns table(user_id uuid, email text, has_device boolean, can_email boolean)
language sql
stable
security invoker
set search_path to ''
as $$
  with listed as (
    select array(select lower(trim(e)) from unnest(coalesce(p_recipient_emails, '{}')) e) as emails
  )
  select p.id,
         lower(trim(p.email)),
         exists (select 1 from public.push_tokens t where t.user_id = p.id)
           and coalesce(p.notification_permission, '') <> 'denied',
         coalesce(p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$', false)
           and not exists (select 1 from public.email_suppression_list x
                           where x.email = lower(trim(p.email)) and x.released_at is null)
  from public.profiles p
  cross join listed
  left join public.user_subscriptions us on us.user_id = p.id
  where coalesce(p.account_status, 'active') = 'active'
    and coalesce(p.is_admin, false) = false
    and (p_target_countries is null or cardinality(p_target_countries) = 0 or p.country = any (p_target_countries))
    and (cardinality(listed.emails) = 0 or lower(trim(p.email)) = any (listed.emails))
    -- Premium = what the app grants right now (get_current_subscription_status).
    and (coalesce(p_audience, 'all') = 'all'
         or coalesce(us.plan_name = 'premium'
                      and us.status in ('active', 'cancelled', 'payment_pending')
                      and (us.expires_at is null or us.expires_at > now() - interval '30 minutes'), false)
            = (p_audience = 'premium'))
    and (not p_skip_night
         or extract(hour from (now() at time zone public.user_timezone(p.timezone, p.country_code))) between 8 and 21);
$$;
revoke all on function public.schedule_audience(text, text[], text[], boolean) from public, anon, authenticated;

drop function if exists public.schedule_targets_user(text, text[], uuid, text);
