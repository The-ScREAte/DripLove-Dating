-- Scheduled broadcasts: three per-schedule options.
--
--  * save_to_inbox        - also keep the message in members' in-app inbox
--                           (broadcast_campaigns.save_to_profile). Off by default:
--                           a scheduled push is delivered once, as a push.
--  * email_fallback       - email people a push can't reach (no device or
--                           notifications off). Copied onto each campaign and
--                           honoured by process-broadcast-queue.
--  * include_new_members  - on (default): the audience is worked out fresh for
--                           every send, so people who join later are included
--                           automatically. Off: only people who were members
--                           when the schedule was created.

alter table public.scheduled_broadcasts
  add column if not exists save_to_inbox boolean not null default false,
  add column if not exists email_fallback boolean not null default true,
  add column if not exists include_new_members boolean not null default true;

alter table public.broadcast_campaigns
  add column if not exists email_fallback boolean not null default true;

-- The current weekly schedules: push only, once, no inbox copy, no email.
update public.scheduled_broadcasts
   set save_to_inbox = false, email_fallback = false
 where channel = 'push';

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

  -- Listed (test) accounts always get it; otherwise only people we can
  -- actually reach on this schedule's channels.
  select coalesce(array_agg(a.user_id), '{}'),
         coalesce(array_agg(a.email) filter (where a.can_email), '{}')
    into v_ids, v_addrs
  from public.schedule_audience(s.audience, s.recipient_emails, s.target_countries, s.activity, p_skip_night) a
  where (v_listed
         or (v_email_channel and a.can_email)
         or (not v_email_channel and (a.has_device or (s.email_fallback and a.can_email))))
    and (s.include_new_members
         or exists (select 1 from public.profiles p where p.id = a.user_id and p.created_at <= s.created_at));

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
       save_to_profile, email_fallback, admin_id, target_countries, scheduled_broadcast_id, occurrence_date, occurrence_at)
    values
      (s.title, s.message, 'system', v_count, 0, 0, 'queued',
       s.save_to_inbox, s.email_fallback, s.admin_id, nullif(s.target_countries, '{}'), s.id,
       (p_slot at time zone 'UTC')::date, p_slot)
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
    where (case when coalesce(s.channel, 'push') = 'email' then a.can_email
                else a.has_device or (s.email_fallback and a.can_email) end)
      -- New members join every future send unless the schedule is limited to
      -- people who were members when it was created.
      and (s.include_new_members or p.created_at <= s.created_at)
  ),
  slots as (
    select c.uid, c.addr, d.day, tm.t as slot_time,
           ((d.day + tm.t::time) at time zone c.tz)
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

-- The updated process-scheduled-broadcasts (one History entry per day and
-- send time) is deployed with this change, so several send times a day are
-- safe again.
alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_one_send_time_tmp;
