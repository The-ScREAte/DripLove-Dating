-- Daily push rhythm.
--
-- Fixed weekly send times plus "nothing within 4 hours of using the app" meant
-- anyone who opened DripLove in the morning lost that day's push entirely. This
-- replaces the fixed times with a daily plan per member:
--
--  * plan_daily_pushes (every 10 minutes) gives each member with the app a plan
--    for their local day: Mon 1, Tue 1, Wed 1-2, Thu 1, Fri-Sun 2 general pushes
--    (away 3+ days: Wed, Fri, Sun; away a week or more: Fridays), each at a random
--    minute inside the day's windows - 8-10, 11-1, 2-4, 5-7, 7-9 local time - and
--    at least 4.5 hours apart. New members are planned on the next run.
--  * Messages rotate from the active "rotation" schedules: never the same one to
--    the same person within 14 days, Premium messages at most 2 a week, 1 a day.
--  * A push held back by smart quiet (just used the app, a recent like, match or
--    message, or too soon after the last push) moves to when the quiet ends
--    instead of being dropped - as long as that's before 9pm their time.
--  * Daily caps for all marketing pushes together: Mon/Tue/Thu 2, Wed and
--    Fri-Sun 3; 2 hours between any two, 4.5 hours between general ones.
--    Tuesday and Thursday are quieter rather than silent.
--  * Recommendation pushes ("you might like...") go out at a local midday and
--    evening hour instead of 12:30 and 19:30 UTC, which was 6:30am in the US
--    and lost to quiet hours every day.
--  * The broadcast worker now picks campaigns that have someone due, instead of
--    the 5 oldest open ones (a day's rotation keeps many campaigns open at once).

-- 1. Rotation schedules -------------------------------------------------------

alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_repeat_type_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_repeat_type_check
  check (repeat_type = any (array['daily', 'every_2_days', 'every_n_days', 'weekdays', 'weekends',
                                  'specific_day', 'interval', 'rotation']));

alter table public.scheduled_broadcasts add column if not exists rotation_windows text[];
alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_rotation_windows_check;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_rotation_windows_check
  check (rotation_windows is null
         or rotation_windows <@ array['morning', 'midday', 'afternoon', 'early_evening', 'evening']);

-- One row per member per local day once their day is planned (so nobody is
-- planned twice).
create table if not exists public.push_day_plans (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  planned integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.push_day_plans enable row level security;

-- 2. Smart quiet with a "try again at" time -------------------------------------

create or replace function public.marketing_push_hold(p_user_id uuid, p_generic boolean default true)
returns table(hold_reason text, hold_until timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_tz text;
  v_local timestamp;
  v_day_start timestamptz;
  v_last_active timestamptz;
  v_event timestamptz;
  v_sent_today integer;
  v_sent_week integer;
  v_last_any timestamptz;
  v_last_generic timestamptz;
begin
  select public.user_timezone(p.timezone, p.country_code) into v_tz from public.profiles p where p.id = p_user_id;
  if not found then
    return query select 'no_profile'::text, null::timestamptz;
    return;
  end if;
  v_tz := coalesce(v_tz, 'UTC');
  v_local := now() at time zone v_tz;
  v_day_start := date_trunc('day', v_local) at time zone v_tz;

  -- Nothing for 4 hours after they use the app...
  v_last_active := public.user_last_active_at(p_user_id);
  if v_last_active > now() - interval '4 hours' then
    return query select 'recently_active'::text, v_last_active + interval '4 hours';
    return;
  end if;

  -- ...or get a like, match or message.
  select greatest(
           (select max(l.created_at) from public.push_delivery_log l
             where l.user_id = p_user_id and l.category = 'event' and l.decision = 'sent'
               and l.created_at > now() - interval '4 hours'),
           (select max(m.created_at) from public.matches m
             where (m.user1_id = p_user_id or m.user2_id = p_user_id)
               and m.created_at > now() - interval '4 hours'),
           (select max(c.created_at) from public.chats c
             where c.recipient_id = p_user_id and c.created_at > now() - interval '4 hours'))
    into v_event;
  if v_event is not null then
    return query select 'recent_event'::text, v_event + interval '4 hours';
    return;
  end if;

  select count(*) filter (where l.created_at >= v_day_start),
         count(*),
         max(l.created_at),
         max(l.created_at) filter (where l.category = 'broadcast')
    into v_sent_today, v_sent_week, v_last_any, v_last_generic
  from public.push_delivery_log l
  where l.user_id = p_user_id and l.category in ('engagement', 'broadcast') and l.decision = 'sent'
    and l.created_at > now() - interval '7 days';

  -- Away a week or more: one a week.
  if v_last_active is null or v_last_active < now() - interval '7 days' then
    if v_sent_week >= 1 then
      return query select 'weekly_budget'::text, null::timestamptz;
      return;
    end if;
    return query select null::text, null::timestamptz;
    return;
  end if;

  -- All marketing pushes together: Mon/Tue/Thu 2 a day, Wed and Fri-Sun 3.
  if v_sent_today >= (case extract(isodow from v_local)::integer when 1 then 2 when 2 then 2 when 4 then 2 else 3 end) then
    return query select 'daily_budget'::text, null::timestamptz;
    return;
  end if;

  -- 2 hours between any two; 4.5 hours between general messages.
  if v_last_any > now() - interval '2 hours' then
    return query select 'too_soon'::text, v_last_any + interval '2 hours';
    return;
  end if;
  if p_generic and v_last_generic > now() - interval '270 minutes' then
    return query select 'too_soon'::text, v_last_generic + interval '270 minutes';
    return;
  end if;

  return query select null::text, null::timestamptz;
end;
$function$;
revoke all on function public.marketing_push_hold(uuid, boolean) from public, anon, authenticated;

-- Kept for existing callers: the reason only.
create or replace function public.marketing_push_gate(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select h.hold_reason from public.marketing_push_hold(p_user_id, true) h;
$function$;

-- Recommendation, streak and game pushes aren't general messages: 2 hours apart
-- from other pushes rather than 4.5.
create or replace function public.push_eligibility(p_user_id uuid, p_category text, p_kind text, p_dedupe_key text default null::text)
returns table(allowed boolean, reason text, tier text, local_hour integer)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_status text; v_permission text; v_tz text; v_country text; v_last timestamptz; v_tier text; v_hour integer;
  v_cat text := lower(coalesce(nullif(p_category, ''), 'engagement'));
  v_gate text;
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

  if v_cat in ('transactional', 'event', 'broadcast') then
    return query select true, v_cat, v_tier, v_hour; return; end if;

  if v_tier in ('inactive', 'dormant') then
    return query select false, 'inactive_no_engagement'::text, v_tier, v_hour; return; end if;
  if v_hour >= 22 or v_hour < 8 then
    return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;

  select h.hold_reason into v_gate from public.marketing_push_hold(p_user_id, false) h;
  if v_gate is not null then
    return query select false, v_gate, v_tier, v_hour; return; end if;
  return query select true, ('engagement_' || v_tier)::text, v_tier, v_hour;
end;
$function$;

-- 3. Claiming: rotation pushes held by smart quiet move later ------------------

create or replace function public.claim_broadcast_recipients(p_campaign_id uuid, p_batch_size integer, p_max_retries integer)
returns table(id uuid, user_id uuid, retry_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quiet boolean;
  v_rotation boolean;
  v_day date;
  v_rows integer;
begin
  select coalesce(s.smart_quiet, false), coalesce(s.repeat_type = 'rotation', false), c.occurrence_date
    into v_quiet, v_rotation, v_day
  from public.broadcast_campaigns c
  left join public.scheduled_broadcasts s on s.id = c.scheduled_broadcast_id
  where c.id = p_campaign_id;
  v_quiet := coalesce(v_quiet, false);
  v_rotation := coalesce(v_rotation, false);

  for i in 1..25 loop
    return query
    with to_claim as (
      select r.id, r.user_id from public.broadcast_recipients r
      where r.campaign_id = p_campaign_id
        and r.status = 'pending'
        and coalesce(r.retry_count, 0) < p_max_retries
        and (r.next_attempt_at is null or r.next_attempt_at <= now())
      order by date_trunc('minute', coalesce(r.next_attempt_at, r.created_at)), r.id
      limit p_batch_size
      for update skip locked
    ),
    judged as (
      select tc.id, h.hold_reason as held,
             -- Moved to when the quiet ends (plus a few minutes) if that's
             -- before 9pm on the planned local day; otherwise dropped for today.
             case when v_rotation and h.hold_reason in ('recently_active', 'recent_event', 'too_soon')
                       and h.hold_until is not null
                       and h.hold_until + interval '25 minutes'
                           < ((coalesce(v_day, (now() at time zone z.tz)::date) + time '21:00') at time zone z.tz)
                  then h.hold_until + make_interval(mins => 5 + floor(random() * 20)::integer)
             end as retry_at
      from to_claim tc
      left join lateral (
        select hh.hold_reason, hh.hold_until from public.marketing_push_hold(tc.user_id, true) hh where v_quiet
      ) h on true
      left join lateral (
        select public.user_timezone(p.timezone, p.country_code) as tz from public.profiles p where p.id = tc.user_id
      ) z on true
    ),
    upd as (
      update public.broadcast_recipients r
         set status = case when j.held is null then 'processing'
                           when j.retry_at is not null then 'pending'
                           else 'suppressed' end,
             processing_started_at = case when j.held is null then now() else null end,
             next_attempt_at = coalesce(j.retry_at, r.next_attempt_at),
             error_message = case when j.held is null then r.error_message
                                  when j.retry_at is not null then 'Moved later: ' || j.held
                                  else 'Held back: ' || j.held end
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

-- 4. Campaigns with someone due right now (for process-broadcast-queue) ---------

create or replace function public.due_broadcast_campaigns(p_limit integer default 10, p_max_retries integer default 3)
returns table(id uuid, title text, message text, notification_type text, status text,
              admin_id uuid, scheduled_broadcast_id uuid, email_fallback boolean)
language sql
stable
security definer
set search_path to ''
as $function$
  select c.id, c.title, c.message, c.notification_type, c.status, c.admin_id, c.scheduled_broadcast_id, c.email_fallback
  from public.broadcast_campaigns c
  where c.status in ('queued', 'processing')
    and exists (select 1 from public.broadcast_recipients r
                where r.campaign_id = c.id
                  and r.status = 'pending'
                  and coalesce(r.retry_count, 0) < p_max_retries
                  and (r.next_attempt_at is null or r.next_attempt_at <= now()))
  order by c.created_at
  limit p_limit;
$function$;
revoke all on function public.due_broadcast_campaigns(integer, integer) from public, anon, authenticated;
grant execute on function public.due_broadcast_campaigns(integer, integer) to service_role;

-- 5. The daily planner -----------------------------------------------------------

create or replace function public.plan_daily_pushes(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  u record;
  w record;
  m record;
  v_today date;
  v_dow integer;
  v_active boolean;
  v_target integer;
  v_recent uuid[];
  v_pitches integer;
  v_pitch_today boolean;
  v_times timestamptz[];
  v_msgs uuid[];
  v_send_at timestamptz;
  v_campaign uuid;
  v_touched uuid[] := '{}';
  v_planned integer := 0;
begin
  if not public.try_acquire_worker_lock('plan-daily-pushes', 300) then
    return 0;
  end if;

  begin
    for u in
      select p.id, lower(trim(p.email)) as email, p.country, p.created_at, z.tz,
             (now() at time zone z.tz) as local_now,
             public.user_last_active_at(p.id) as last_active,
             coalesce(us.plan_name = 'premium'
                      and us.status in ('active', 'cancelled', 'payment_pending')
                      and (us.expires_at is null or us.expires_at > now() - interval '30 minutes'), false) as is_premium
      from public.profiles p
      cross join lateral (select public.user_timezone(p.timezone, p.country_code) as tz) z
      left join public.user_subscriptions us on us.user_id = p.id
      where coalesce(p.account_status, 'active') = 'active'
        and coalesce(p.is_admin, false) = false
        and coalesce(p.notification_permission, '') <> 'denied'
        and exists (select 1 from public.push_tokens t where t.user_id = p.id)
        and (now() at time zone z.tz)::time < time '20:30'
        and not exists (select 1 from public.push_day_plans d
                        where d.user_id = p.id and d.local_date = (now() at time zone z.tz)::date)
      order by p.id
      limit p_limit
    loop
      begin
        v_today := u.local_now::date;
        v_dow := extract(isodow from u.local_now)::integer;
        v_active := coalesce(u.last_active > now() - interval '3 days', false);

        if v_active then
          v_target := case v_dow when 3 then 1 + (random() < 0.5)::integer
                                 when 5 then 2 when 6 then 2 when 7 then 2 else 1 end;
        elsif u.last_active > now() - interval '7 days' then
          v_target := case when v_dow in (3, 5, 7) then 1 else 0 end;
        else
          v_target := case when v_dow = 5 then 1 else 0 end;
        end if;

        -- Less any general push they've already had today.
        v_target := v_target - (
          select count(*)::integer from public.push_delivery_log l
          where l.user_id = u.id and l.category = 'broadcast' and l.decision = 'sent'
            and l.created_at >= (v_today::timestamp at time zone u.tz));

        insert into public.push_day_plans (user_id, local_date) values (u.id, v_today)
        on conflict do nothing;
        continue when not found;
        v_planned := v_planned + 1;
        continue when v_target <= 0;

        -- Messages they've had in the last 14 days (never repeated) and Premium
        -- messages in the last 7 (at most 2 a week).
        select coalesce(array_agg(distinct c.scheduled_broadcast_id), '{}'),
               count(*) filter (where s.audience <> 'all' and r.created_at > now() - interval '7 days')
          into v_recent, v_pitches
        from public.broadcast_recipients r
        join public.broadcast_campaigns c on c.id = r.campaign_id
        join public.scheduled_broadcasts s on s.id = c.scheduled_broadcast_id
        where r.user_id = u.id
          and r.status in ('pending', 'processing', 'sent')
          and r.created_at > now() - interval '14 days';

        v_times := '{}';
        v_msgs := '{}';
        v_pitch_today := false;

        for w in
          select x.name,
                 date_trunc('minute', (v_today + x.from_t) + random() * (x.to_t - x.from_t)) as local_at
          from (values ('morning', time '08:00', time '10:00'),
                       ('midday', time '11:00', time '13:00'),
                       ('afternoon', time '14:00', time '16:00'),
                       ('early_evening', time '17:00', time '19:00'),
                       ('evening', time '19:00', time '21:00')) as x(name, from_t, to_t)
          order by random()
        loop
          exit when cardinality(v_times) >= v_target;
          v_send_at := w.local_at at time zone u.tz;
          continue when v_send_at < now() + interval '10 minutes';
          continue when exists (select 1 from unnest(v_times) t
                                where abs(extract(epoch from (t - v_send_at))) < 270 * 60);

          select s.id, s.title, s.message, s.admin_id, s.audience, s.save_to_inbox, s.email_fallback
            into m
          from public.scheduled_broadcasts s
          where s.is_active and s.repeat_type = 'rotation' and s.channel = 'push'
            and (s.audience = 'all' or s.audience = case when u.is_premium then 'premium' else 'free' end)
            and s.activity in ('any', case when v_active then 'active' else 'inactive' end)
            and (coalesce(cardinality(s.specific_days), 0) = 0 or to_char(u.local_now, 'FMday') = any (s.specific_days))
            and (coalesce(cardinality(s.rotation_windows), 0) = 0 or w.name = any (s.rotation_windows))
            and (s.starts_at is null or s.starts_at <= v_send_at)
            and (s.ends_at is null or s.ends_at > v_send_at)
            and (coalesce(cardinality(s.target_countries), 0) = 0 or u.country = any (s.target_countries))
            and (coalesce(cardinality(s.recipient_emails), 0) = 0
                 or u.email = any (array(select lower(trim(e)) from unnest(s.recipient_emails) e)))
            and (s.include_new_members or u.created_at <= s.created_at)
            and not (s.id = any (v_recent))
            and not (s.id = any (v_msgs))
            and (s.audience = 'all' or (v_pitches < 2 and not v_pitch_today))
          -- Day- and time-specific messages first (Monday morning, Friday...).
          order by coalesce(cardinality(s.specific_days), 0) > 0 desc,
                   coalesce(cardinality(s.rotation_windows), 0) > 0 desc,
                   random()
          limit 1;
          continue when not found;

          -- One History entry per message and local day.
          v_campaign := null;
          insert into public.broadcast_campaigns
            (title, message, notification_type, total_recipients, successful_sends, failed_sends, status,
             save_to_profile, email_fallback, admin_id, scheduled_broadcast_id, occurrence_date, occurrence_time)
          values
            (m.title, m.message, 'system', 0, 0, 0, 'processing',
             m.save_to_inbox, m.email_fallback, m.admin_id, m.id, v_today, 'rotation')
          on conflict do nothing
          returning id into v_campaign;
          if v_campaign is null then
            select c.id into v_campaign from public.broadcast_campaigns c
            where c.scheduled_broadcast_id = m.id and c.occurrence_date = v_today
              and c.occurrence_time = 'rotation' and c.occurrence_at is null;
          else
            update public.scheduled_broadcasts
               set last_sent_at = now(), total_sends = coalesce(total_sends, 0) + 1
             where id = m.id;
          end if;
          continue when v_campaign is null;

          insert into public.broadcast_recipients (campaign_id, user_id, status, retry_count, next_attempt_at)
          values (v_campaign, u.id, 'pending', 0, v_send_at)
          on conflict do nothing;
          continue when not found;

          v_times := v_times || v_send_at;
          v_msgs := v_msgs || m.id;
          v_pitch_today := v_pitch_today or m.audience <> 'all';
          if not (v_campaign = any (v_touched)) then
            v_touched := v_touched || v_campaign;
          end if;
        end loop;

        update public.push_day_plans set planned = cardinality(v_times)
         where user_id = u.id and local_date = v_today;
      exception when others then
        raise warning 'plan_daily_pushes: skipped user % (%)', u.id, sqlerrm;
      end;
    end loop;

    update public.broadcast_campaigns c
       set total_recipients = (select count(*) from public.broadcast_recipients r where r.campaign_id = c.id),
           status = 'processing'
     where c.id = any (v_touched);

    delete from public.push_day_plans where local_date < current_date - 30;
  exception when others then
    perform public.release_worker_lock('plan-daily-pushes');
    raise;
  end;

  perform public.release_worker_lock('plan-daily-pushes');
  return v_planned;
end;
$function$;
revoke all on function public.plan_daily_pushes(integer) from public, anon, authenticated;

-- The fixed-time scheduler skips rotation messages (they're planned above).
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
  where b.id = p_schedule_id and b.is_active and b.repeat_type not in ('interval', 'rotation');
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

-- 6. Recommendation pushes at local times ---------------------------------------
-- "recommended" goes out at 11:30 or 12:30 their time (up to 2:30pm if they're
-- busy), "similar" at 6:30 or 7:30pm (up to 8:30pm). The day is only marked
-- done once a push is actually allowed, so a busy hour retries the next hour.

create or replace function public.send_recommendation_notifications(p_row_key text default 'recommended'::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  rec record;
  v_countries text[];
  v_is_premium boolean;
  v_candidate_id uuid;
  v_candidate record;
  v_trait text;
  v_age integer;
  v_title text;
  v_body text;
  v_from_circle boolean;
  v_already_sent boolean;
  v_allowed boolean;
  v_today date;
  v_min_gap interval := interval '4 hours';
BEGIN
  IF p_row_key NOT IN ('recommended', 'similar') THEN
    RAISE EXCEPTION 'send_recommendation_notifications: unsupported row key %', p_row_key;
  END IF;

  FOR rec IN
    SELECT p.id, p.first_name, p.interests, p.languages, p.pets,
           p.relationship_intent, p.gender, p.preference, p.country_code,
           p.latitude, p.longitude, p.max_distance, p.min_age, p.max_age,
           p.unlocked_countries, p.last_recommendation_sent_date,
           p.last_similar_sent_date, p.last_recommendation_sent_at,
           p.last_recommended_profile_id, z.tz
    FROM public.profiles p
    CROSS JOIN LATERAL (SELECT public.user_timezone(p.timezone, p.country_code) AS tz) z
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND p.country_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
      AND extract(hour from (now() AT TIME ZONE z.tz))::integer
          BETWEEN (CASE p_row_key WHEN 'recommended' THEN 11 ELSE 18 END)
                  + mod(abs(hashtext(p.id::text || ((now() AT TIME ZONE z.tz)::date)::text)), 2)
              AND (CASE p_row_key WHEN 'recommended' THEN 14 ELSE 20 END)
      AND CASE p_row_key
            WHEN 'recommended' THEN p.last_recommendation_sent_date IS DISTINCT FROM (now() AT TIME ZONE z.tz)::date
            ELSE p.last_similar_sent_date IS DISTINCT FROM (now() AT TIME ZONE z.tz)::date
          END
      AND (
        p.last_recommendation_sent_at IS NULL
        OR p.last_recommendation_sent_at < now() - v_min_gap
      )
    ORDER BY p.last_recommendation_sent_at NULLS FIRST
    LIMIT 20000
  LOOP
    BEGIN
      v_today := (now() AT TIME ZONE rec.tz)::date;
      v_already_sent := CASE p_row_key
        WHEN 'recommended' THEN rec.last_recommendation_sent_date = v_today
        ELSE rec.last_similar_sent_date = v_today
      END;
      IF v_already_sent THEN
        CONTINUE;
      END IF;

      IF rec.last_recommendation_sent_at IS NOT NULL
         AND rec.last_recommendation_sent_at > now() - v_min_gap THEN
        CONTINUE;
      END IF;

      -- Busy right now (smart quiet, daily budget)? Try again next hour.
      SELECT e.allowed INTO v_allowed
      FROM public.push_eligibility(rec.id, 'engagement', 'recommendation', NULL) e;
      IF NOT coalesce(v_allowed, false) THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.user_subscriptions s
        WHERE s.user_id = rec.id
          AND s.plan_name = 'premium'
          AND s.status IN ('active', 'cancelled')
          AND (s.expires_at IS NULL OR s.expires_at > now())
      ) INTO v_is_premium;

      v_countries := ARRAY[rec.country_code];
      IF v_is_premium AND rec.unlocked_countries IS NOT NULL THEN
        v_countries := ARRAY(SELECT DISTINCT unnest(v_countries || rec.unlocked_countries));
      END IF;

      v_candidate_id := NULL;
      v_from_circle := true;

      SELECT pid INTO v_candidate_id
      FROM (
        SELECT unnest(profile_ids) AS pid
        FROM public.circle_row_batches
        WHERE user_id = rec.id AND row_key = p_row_key
      ) candidates
      WHERE (rec.last_recommended_profile_id IS NULL OR candidates.pid <> rec.last_recommended_profile_id)
        AND NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = rec.id AND l.liked_id = candidates.pid)
        AND NOT EXISTS (SELECT 1 FROM public.passes ps WHERE ps.passer_id = rec.id AND ps.passed_id = candidates.pid)
        AND NOT EXISTS (
          SELECT 1 FROM public.matches m
          WHERE (m.user1_id = rec.id AND m.user2_id = candidates.pid)
             OR (m.user2_id = rec.id AND m.user1_id = candidates.pid)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.blocker_id = rec.id AND b.blocked_id = candidates.pid)
             OR (b.blocker_id = candidates.pid AND b.blocked_id = rec.id)
        )
      ORDER BY random()
      LIMIT 1;

      -- Nothing in that Circle row - fall back to the next card the Discover
      -- deck would show them. feed_random_weight is the deck's own ordering,
      -- so this really is "the next card", not an unrelated pick.
      IF v_candidate_id IS NULL THEN
        v_from_circle := false;
        SELECT c.id INTO v_candidate_id
        FROM public.profiles c
        WHERE c.id <> rec.id
          AND (rec.last_recommended_profile_id IS NULL OR c.id <> rec.last_recommended_profile_id)
          AND c.account_status = 'active'
          AND c.is_admin IS NOT TRUE
          AND c.is_archived IS NOT TRUE
          AND c.country_code = ANY(v_countries)
          AND (c.preference = rec.gender OR c.preference = 'everyone')
          AND (rec.preference = 'everyone' OR rec.preference IS NULL OR c.gender = rec.preference)
          AND date_part('year', age(c.date_of_birth))
              BETWEEN COALESCE(rec.min_age, 18) AND COALESCE(rec.max_age, 99)
          AND (
            c.country_code <> rec.country_code
            OR rec.latitude IS NULL OR rec.longitude IS NULL
            OR c.latitude IS NULL OR c.longitude IS NULL
            OR public.calculate_distance(rec.latitude, rec.longitude, c.latitude, c.longitude)
               <= COALESCE(rec.max_distance, 5000)
          )
          AND EXISTS (
            SELECT 1 FROM public.user_images ui
            WHERE ui.user_id = c.id AND ui.is_approved = true AND ui.image_order <> -1
          )
          AND NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = rec.id AND l.liked_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM public.passes ps WHERE ps.passer_id = rec.id AND ps.passed_id = c.id)
          AND NOT EXISTS (
            SELECT 1 FROM public.blocks b
            WHERE (b.blocker_id = rec.id AND b.blocked_id = c.id)
               OR (b.blocker_id = c.id AND b.blocked_id = rec.id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.matches m
            WHERE (m.user1_id = rec.id AND m.user2_id = c.id)
               OR (m.user1_id = c.id AND m.user2_id = rec.id)
          )
        ORDER BY c.feed_random_weight
        LIMIT 1;
      END IF;

      IF v_candidate_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT first_name, date_of_birth, city, interests, languages, pets,
             relationship_intent
      INTO v_candidate
      FROM public.profiles
      WHERE id = v_candidate_id;

      v_trait := public.pick_shared_trait(
        rec.interests, rec.languages, rec.pets, rec.relationship_intent,
        v_candidate.interests, v_candidate.languages, v_candidate.pets,
        v_candidate.relationship_intent
      );

      v_age := CASE WHEN v_candidate.date_of_birth IS NOT NULL
        THEN extract(year from age(v_candidate.date_of_birth))::int
        ELSE NULL END;

      -- A Discover-deck fallback isn't a Circle row, so it always reads as
      -- a plain recommendation regardless of which slot triggered it.
      IF p_row_key = 'similar' AND v_from_circle THEN
        v_title := coalesce(nullif(rec.first_name, ''), 'Someone') || ', you have a lot in common';
      ELSE
        v_title := coalesce(nullif(rec.first_name, ''), 'Someone') || ', you might like…';
      END IF;

      v_body := public.build_profile_push_body(
        v_candidate.first_name, v_age, v_candidate.city, v_trait
      );

      PERFORM net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'userId', rec.id,
          'type', 'system',
          'data', jsonb_build_object(
            'action', 'open_circle_profile',
            'profileId', v_candidate_id,
            'senderId', v_candidate_id
          )
        )
      );

      IF p_row_key = 'recommended' THEN
        UPDATE public.profiles
        SET last_recommendation_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = v_candidate_id
        WHERE id = rec.id;
      ELSE
        UPDATE public.profiles
        SET last_similar_sent_date = v_today,
            last_recommendation_sent_at = now(),
            last_recommended_profile_id = v_candidate_id
        WHERE id = rec.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_recommendation_notifications(%): skipping user % after error: %', p_row_key, rec.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;

-- 7. The message pool ------------------------------------------------------------

-- Today's fixed-time sends that haven't gone out yet are replaced by today's plan.
update public.broadcast_recipients r
   set status = 'cancelled', error_message = 'Replaced by the daily rotation', processing_started_at = null
  from public.broadcast_campaigns c
 where r.campaign_id = c.id and r.status = 'pending'
   and c.scheduled_broadcast_id in (select s.id from public.scheduled_broadcasts s
                                    where s.repeat_type = 'specific_day' and s.channel = 'push' and s.is_active);

update public.broadcast_campaigns c
   set status = 'completed'
 where c.scheduled_broadcast_id is not null and c.status in ('queued', 'processing')
   and not exists (select 1 from public.broadcast_recipients r
                   where r.campaign_id = c.id and r.status in ('pending', 'processing'));

-- The 16 weekly messages join the rotation.
update public.scheduled_broadcasts
   set repeat_type = 'rotation', specific_day = null, specific_days = null, send_times = null,
       send_window_minutes = 0, rotation_windows = null, smart_quiet = true, save_to_inbox = false,
       email_fallback = false, include_new_members = true, recipient_emails = null, target_countries = null,
       next_send_at = null
 where repeat_type = 'specific_day' and channel = 'push' and is_active;

update public.scheduled_broadcasts s
   set specific_days = v.days, rotation_windows = v.windows
  from (values
    ('Fresh start ☀️',  array['monday'],  array['morning']),
    ('Friday energy ✨', array['friday'],  array['morning', 'midday']),
    ('Get noticed 📸',  null::text[],     array['morning', 'midday', 'afternoon']),
    ('Profile check ✨', null::text[],     array['morning', 'midday', 'afternoon']),
    ('Tonight? ❤️',     null::text[],     array['early_evening', 'evening']),
    ('Something real 🤍', null::text[],   array['early_evening', 'evening']),
    ('Say hello 💌',    null::text[],     array['midday', 'afternoon', 'early_evening', 'evening'])
  ) as v(title, days, windows)
 where s.title = v.title and s.repeat_type = 'rotation';

-- New messages, so nobody sees the same one twice in 14 days.
insert into public.scheduled_broadcasts
  (channel, title, message, repeat_type, time_to_send, is_active, total_sends, admin_id, audience, activity,
   specific_days, rotation_windows, send_window_minutes, smart_quiet, save_to_inbox, email_fallback, include_new_members)
select 'push', v.title, v.message, 'rotation', '09:00', true, 0,
       (select b.admin_id from public.scheduled_broadcasts b where b.repeat_type = 'rotation' order by b.created_at limit 1),
       v.audience, v.activity, v.days, v.windows, 0, true, false, false, true
from (values
  ('Good morning ☕', 'Start your day with a quick look at who''s on DripLove.', 'all', 'active', null::text[], array['morning']),
  ('Lunch break? 🍽️', 'Take a few minutes and see who catches your eye today.', 'all', 'active', null::text[], array['midday']),
  ('Take a look 💫', 'A few minutes on DripLove could lead to your next great conversation.', 'all', 'active', null::text[], null::text[]),
  ('Start with hello 👋', 'A simple hello is often all it takes. Send a message today.', 'all', 'active', null::text[], null::text[]),
  ('Be yourself 🌟', 'The best profiles feel real. Add a detail that shows who you are.', 'all', 'active', null::text[], array['morning', 'midday', 'afternoon']),
  ('Keep it going 🔥', 'Good conversations grow when you keep them going. Reply to someone today.', 'all', 'active', null::text[], array['afternoon', 'early_evening', 'evening']),
  ('Afternoon check-in ☀️', 'Take a short break and see who''s around on DripLove.', 'all', 'active', null::text[], array['afternoon']),
  ('Evening plans? 🌙', 'Wind down with a few profiles. Someone might catch your eye.', 'all', 'active', null::text[], array['evening']),
  ('Weekend mood 🎉', 'Weekends are made for meeting new people. See who''s on DripLove.', 'all', 'active', array['saturday', 'sunday'], null::text[]),
  ('Sunday reset 🤍', 'A calm Sunday is a good time to refresh your profile and say hello.', 'all', 'active', array['sunday'], null::text[]),
  ('Midweek moment 💬', 'Halfway through the week. A good time to start a new conversation.', 'all', 'active', array['wednesday'], null::text[]),
  ('Ask a question ❓', 'Not sure what to say? Ask about something in their profile.', 'all', 'active', null::text[], null::text[]),
  ('Quality over quantity 💎', 'Take a moment with each profile. The right person is worth it.', 'all', 'active', null::text[], null::text[]),
  ('Add a recent photo 📷', 'Recent photos help people get to know the real you.', 'all', 'active', null::text[], array['morning', 'midday', 'afternoon']),
  ('New faces 👀', 'New people join DripLove all the time. Take a look.', 'all', 'active', null::text[], null::text[]),
  ('See who likes you 💖', 'Premium shows you everyone who liked your profile, so you never miss a match.', 'free', 'active', null::text[], null::text[]),
  ('Meet beyond borders ✈️', 'Premium lets you explore up to 4 more countries. Your match could be anywhere.', 'free', 'active', null::text[], null::text[]),
  ('Your likes are waiting 💖', 'See everyone who liked you and make the first move.', 'premium', 'active', null::text[], null::text[]),
  ('Explore somewhere new ✈️', 'Your Premium includes up to 4 extra countries. Try a new one this week.', 'premium', 'active', null::text[], null::text[]),
  ('We miss you 💜', 'Your profile is still here. Come back and see who''s new.', 'all', 'inactive', null::text[], null::text[]),
  ('Pick up where you left off 💬', 'It only takes a minute to see who''s on DripLove today.', 'all', 'inactive', null::text[], null::text[]),
  ('A lot can change ✨', 'New people join DripLove all the time. See who''s here now.', 'all', 'inactive', null::text[], null::text[]),
  ('Your next hello 👋', 'Someone could be waiting for a message like yours. Come say hello.', 'all', 'inactive', null::text[], null::text[])
) as v(title, message, audience, activity, days, windows)
where not exists (select 1 from public.scheduled_broadcasts b where b.title = v.title and b.audience = v.audience);

-- 8. Jobs -----------------------------------------------------------------------

select cron.schedule('plan-daily-pushes', '*/10 * * * *', $$select public.plan_daily_pushes();$$);
select cron.alter_job((select jobid from cron.job where jobname = 'send-recommendation-notifications-midday'), schedule := '30 * * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'send-recommendation-notifications-evening'), schedule := '30 * * * *');
