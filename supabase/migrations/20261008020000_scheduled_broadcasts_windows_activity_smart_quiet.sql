-- Scheduled broadcasts, part 4.
--
--  * send_window_minutes - spread a send over a window (e.g. 09:00-10:30):
--    each person gets their own time in it, stable per person and day, so a
--    whole audience isn't pinged at the same minute.
--  * activity - 'any', 'active' (opened the app in the last 3 days) or
--    'inactive' (not in 3+ days; for re-engagement messages).
--  * smart_quiet - checked at the moment of sending: anyone who opened the
--    app, matched or got a message in the last 4 hours is skipped (status
--    'suppressed', not in their inbox either).

alter table public.scheduled_broadcasts
  add column if not exists send_window_minutes integer not null default 0,
  add column if not exists activity text not null default 'any',
  add column if not exists smart_quiet boolean not null default false;

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_send_window_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_send_window_check
  check (send_window_minutes between 0 and 180);

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_activity_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_activity_check
  check (activity in ('any', 'active', 'inactive'));

-- Audience, now with activity. Last active = same signals as user_last_active_at.
drop function if exists public.schedule_audience(text, text[], text[], boolean);
create function public.schedule_audience(
  p_audience text, p_recipient_emails text[], p_target_countries text[], p_activity text, p_skip_night boolean
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
    and (coalesce(p_activity, 'any') = 'any'
         or coalesce(greatest(
              p.last_app_open_at,
              p.last_login_at,
              case when p.last_streak_date is not null
                then least((p.last_streak_date::timestamp + interval '12 hours') at time zone 'UTC', now()) end,
              (select max(coalesce(t.last_seen_at, t.updated_at)) from public.push_tokens t where t.user_id = p.id)
            ) > now() - interval '3 days', false) = (p_activity = 'active'))
    and (not p_skip_night
         or extract(hour from (now() at time zone public.user_timezone(p.timezone, p.country_code))) between 8 and 21);
$$;
revoke all on function public.schedule_audience(text, text[], text[], text, boolean) from public, anon, authenticated;

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
  from public.schedule_audience(s.audience, s.recipient_emails, s.target_countries, s.activity, p_skip_night) a
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

-- Daily/weekly schedules: each person's own time inside the send window.
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
  v_window integer;
begin
  select * into s from public.scheduled_broadcasts b
  where b.id = p_schedule_id and b.is_active and b.repeat_type <> 'interval';
  if not found then return; end if;
  v_window := greatest(coalesce(s.send_window_minutes, 0), 0);

  select coalesce(array_agg(distinct t), '{}') into v_times
  from unnest(coalesce(nullif(s.send_times, '{}'), array[s.time_to_send])) t
  where t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  if cardinality(v_times) = 0 then return; end if;

  return query
  with candidates as (
    select a.user_id as uid, a.email as addr,
           public.user_timezone(p.timezone, p.country_code) as tz
    from public.schedule_audience(s.audience, s.recipient_emails, s.target_countries, s.activity, false) a
    join public.profiles p on p.id = a.user_id
    where a.can_email or (coalesce(s.channel, 'push') <> 'email' and a.has_device)
  ),
  slots as (
    select c.uid, c.addr, d.day, tm.t as slot_time,
           ((d.day + tm.t::time) at time zone c.tz)
             -- Stable per person and day, so every run picks the same minute.
             + make_interval(mins => case when v_window > 0
                 then (mod(hashtext(p_schedule_id::text || c.uid::text || d.day::text || tm.t)::bigint + 2147483648, v_window))::integer
                 else 0 end) as at
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

drop function if exists public.preview_schedule_audience(text, text, text[], text[]);
create function public.preview_schedule_audience(
  p_channel text, p_audience text, p_recipient_emails text[], p_target_countries text[], p_activity text
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
  from public.schedule_audience(p_audience, nullif(p_recipient_emails, '{}'), nullif(p_target_countries, '{}'),
                                p_activity, false) a;
end;
$$;
revoke all on function public.preview_schedule_audience(text, text, text[], text[], text) from public, anon;
grant execute on function public.preview_schedule_audience(text, text, text[], text[], text) to authenticated;

-- Push claim with smart quiet, decided at the moment of sending.
create or replace function public.claim_broadcast_recipients(p_campaign_id uuid, p_batch_size integer, p_max_retries integer)
returns table(id uuid, user_id uuid, retry_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quiet boolean;
  v_rows integer;
begin
  select coalesce(s.smart_quiet, false) into v_quiet
  from public.broadcast_campaigns c
  left join public.scheduled_broadcasts s on s.id = c.scheduled_broadcast_id
  where c.id = p_campaign_id;
  v_quiet := coalesce(v_quiet, false);

  -- A batch can be entirely quiet; keep going until something is sendable or
  -- nothing more is due, so the worker doesn't stop early.
  for i in 1..25 loop
    return query
    with to_claim as (
      select r.id, r.user_id from public.broadcast_recipients r
      where r.campaign_id = p_campaign_id
        and r.status = 'pending'
        and coalesce(r.retry_count, 0) < p_max_retries
        and (r.next_attempt_at is null or r.next_attempt_at <= now())
      -- Earliest due first; within the same minute, random (ids are random
      -- UUIDs, new for every send).
      order by date_trunc('minute', coalesce(r.next_attempt_at, r.created_at)), r.id
      limit p_batch_size
      for update skip locked
    ),
    judged as (
      select tc.id,
             v_quiet and (
               public.user_last_active_at(tc.user_id) > now() - interval '4 hours'
               or exists (select 1 from public.matches m
                          where (m.user1_id = tc.user_id or m.user2_id = tc.user_id)
                            and m.created_at > now() - interval '4 hours')
               or exists (select 1 from public.chats ch
                          where ch.recipient_id = tc.user_id and ch.created_at > now() - interval '4 hours')
             ) as quiet
      from to_claim tc
    ),
    upd as (
      update public.broadcast_recipients r
         set status = case when j.quiet then 'suppressed' else 'processing' end,
             processing_started_at = case when j.quiet then null else now() end,
             error_message = case when j.quiet
               then 'Smart quiet: opened the app, matched or got a message in the last 4 hours'
               else r.error_message end
        from judged j
       where r.id = j.id
      returning r.id, r.user_id, coalesce(r.retry_count, 0) as retries, r.status
    )
    select upd.id, upd.user_id, upd.retries from upd where upd.status = 'processing';

    get diagnostics v_rows = row_count;
    exit when v_rows > 0 or not v_quiet;
    exit when not exists (
      select 1 from public.broadcast_recipients r
      where r.campaign_id = p_campaign_id
        and r.status = 'pending'
        and coalesce(r.retry_count, 0) < p_max_retries
        and (r.next_attempt_at is null or r.next_attempt_at <= now()));
  end loop;
end;
$function$;
