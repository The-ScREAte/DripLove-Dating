-- 1) Nothing is held back any more: a like is pushed the moment it happens
--    (any hour), and an admin push goes out the moment it is sent.
-- 2) People we can't push (no app / notifications off) get the likes & matches
--    email right away too - at most 2 a day; anything beyond that is counted
--    into their next email.
-- 3) Scheduled broadcasts (email and push) arrive at the chosen time in each
--    person's OWN time zone, on the chosen days. Before this, nothing ran them
--    at all (the schedule job was removed in Dec 2025), and the time was the
--    admin's browser time, recalculated in UTC after the first send.

-- 1. Push rules: likes and broadcasts are no longer delayed -----------------------

create or replace function public.push_eligibility(p_user_id uuid, p_category text, p_kind text, p_dedupe_key text default null)
returns table (allowed boolean, reason text, tier text, local_hour integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text; v_permission text; v_tz text; v_country text; v_last timestamptz; v_tier text; v_hour integer;
  v_cat text := lower(coalesce(nullif(p_category, ''), 'engagement'));
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

  -- Account notices, real-person events (messages, matches, likes) and admin
  -- broadcasts: always, straight away.
  if v_cat in ('transactional', 'event', 'broadcast') then
    return query select true, v_cat, v_tier, v_hour; return; end if;

  -- Automatic engagement pushes (recommendations, streaks, games, comeback).
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

-- 2. Likes & matches email: right away, max 2 a day -------------------------------
-- (No more waiting for daytime, no gap between the two, and no skipping
-- because the person opened the app.)

create or replace function public.claim_missed_notifications(
  p_max_users integer default 200,
  p_email_budget integer default 0,
  p_dry_run boolean default false,
  p_only_users uuid[] default null
)
returns table (
  user_id uuid, route text, reason text, local_hour integer, email text, first_name text,
  like_count integer, match_count integer, match_sender_ids text[], item_ids bigint[]
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r record;
  v_route record;
  v_elig record;
  v_returned integer := 0;
  v_emails integer := 0;
  v_recent integer;
  v_claimed bigint[];
begin
  if not p_dry_run then
    -- A run that died part-way: put its items back.
    update public.notification_email_queue q set status = 'pending'
     where q.status = 'claimed' and q.handled_at < now() - interval '30 minutes'
       and (p_only_users is null or q.user_id = any (p_only_users));
    -- Too old to be worth announcing.
    update public.notification_email_queue q set status = 'expired', handled_at = now()
     where q.status = 'pending'
       and q.created_at < now() - case when q.kind = 'match' then interval '72 hours' else interval '48 hours' end
       and (p_only_users is null or q.user_id = any (p_only_users));
  end if;

  for r in
    select q.user_id as uid,
           (count(*) filter (where q.kind = 'like'))::integer as likes,
           (count(*) filter (where q.kind = 'match'))::integer as matches,
           coalesce(array_agg(q.data->>'senderId') filter (
             where q.kind = 'match' and coalesce(q.data->>'senderId', '') <> ''), '{}'::text[]) as match_senders,
           array_agg(q.id) as ids
    from public.notification_email_queue q
    where q.status = 'pending'
      and (p_only_users is null or q.user_id = any (p_only_users))
      and q.created_at > now() - case when q.kind = 'match' then interval '72 hours' else interval '48 hours' end
    group by q.user_id
    order by count(*) filter (where q.kind = 'match') desc, min(q.created_at)
  loop
    exit when v_returned >= p_max_users;

    -- One decision per person at a time (the schedule and an instant run for
    -- the same person can overlap).
    if not p_dry_run then
      perform pg_advisory_xact_lock(hashtextextended('missed-notifications:' || r.uid::text, 0));
    end if;

    select * into v_route from public.missed_notification_route(r.uid);

    if v_route.route = 'none' then
      if not p_dry_run then
        update public.notification_email_queue q
           set status = 'dropped', channel = v_route.reason, handled_at = now()
         where q.id = any (r.ids) and q.status = 'pending';
      end if;
      continue;
    end if;

    if v_route.route = 'push' then
      -- Only items whose push failed end up here; try the push again.
      select * into v_elig from public.push_eligibility(r.uid, 'event', 'like', null);
      if not coalesce(v_elig.allowed, false) then continue; end if;
    else
      -- Email: at most 2 in any 24 hours (counting ones on their way).
      select count(*) into v_recent from (
        select 1 from public.email_send_queue e
         where e.user_id = r.uid and e.kind = 'notification'
           and e.created_at > now() - interval '24 hours' and e.status <> 'failed'
        union all
        select 1 from public.notification_email_queue c
         where c.user_id = r.uid and c.status = 'claimed' and c.channel = 'email'
         group by c.handled_at
      ) recent;
      if v_recent >= 2 then continue; end if;
      if v_emails >= p_email_budget then continue; end if;
    end if;

    if p_dry_run then
      v_claimed := r.ids;
    else
      with upd as (
        update public.notification_email_queue q
           set status = 'claimed', channel = v_route.route, handled_at = now()
         where q.id = any (r.ids) and q.status = 'pending'
        returning q.id
      )
      select array_agg(upd.id) into v_claimed from upd;
      if v_claimed is null then continue; end if;
    end if;

    if v_route.route = 'email' then v_emails := v_emails + 1; end if;
    v_returned := v_returned + 1;
    return query select r.uid, v_route.route, v_route.reason, v_route.local_hour, v_route.email,
                        v_route.first_name, r.likes, r.matches, r.match_senders, v_claimed;
  end loop;
end;
$$;
revoke all on function public.claim_missed_notifications(integer, integer, boolean, uuid[]) from public, anon, authenticated;

-- Safety net every 5 minutes (the instant path is send-push-notification
-- starting a run for that person straight away).
select cron.schedule(
  'process-missed-notifications',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-missed-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.notification_email_queue where status = 'pending');
  $cron$
);

-- 3. Scheduled broadcasts in each person's local time --------------------------

-- One History entry per schedule per day, filled in as each time zone reaches
-- the chosen time.
alter table public.email_broadcast_history
  add column if not exists scheduled_broadcast_id uuid,
  add column if not exists occurrence_date date;
alter table public.broadcast_campaigns
  add column if not exists scheduled_broadcast_id uuid,
  add column if not exists occurrence_date date;
create unique index if not exists email_broadcast_history_schedule_day_idx
  on public.email_broadcast_history (scheduled_broadcast_id, occurrence_date)
  where scheduled_broadcast_id is not null;
create unique index if not exists broadcast_campaigns_schedule_day_idx
  on public.broadcast_campaigns (scheduled_broadcast_id, occurrence_date)
  where scheduled_broadcast_id is not null;

-- Scheduled emails that can't go out within a few hours of their time (daily
-- sending limit) are dropped instead of piling up day after day.
alter table public.email_send_queue add column if not exists expires_at timestamptz;

-- Who has been given which day's send - makes every run safe to repeat.
create table if not exists public.scheduled_broadcast_deliveries (
  schedule_id uuid not null,
  user_id uuid not null,
  local_date date not null,
  send_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (schedule_id, user_id, local_date)
);
alter table public.scheduled_broadcast_deliveries enable row level security;

-- Does the schedule run on this (local) day?
create or replace function public.schedule_runs_on(p_repeat text, p_specific_day text, p_anchor date, p_day date)
returns boolean
language sql immutable set search_path = '' as $$
  select case p_repeat
    when 'daily' then true
    when 'every_2_days' then p_day >= p_anchor and ((p_day - p_anchor) % 2) = 0
    when 'weekdays' then extract(isodow from p_day) between 1 and 5
    when 'weekends' then extract(isodow from p_day) in (6, 7)
    when 'specific_day' then to_char(p_day, 'FMday') = lower(coalesce(p_specific_day, ''))
    else false
  end;
$$;

-- People whose chosen local time falls in the next p_ahead (or the last
-- p_grace, to cover a late run) and who haven't been given today's send yet.
-- Records them so a later run never adds them twice.
create or replace function public.prepare_scheduled_broadcast(
  p_schedule_id uuid,
  p_ahead interval default '2 hours',
  p_grace interval default '30 minutes'
)
returns table (user_id uuid, email text, local_date date, send_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  s record;
  v_time time;
begin
  select * into s from public.scheduled_broadcasts b where b.id = p_schedule_id and b.is_active;
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
      and case when s.channel = 'email' then
            p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
            and not exists (select 1 from public.email_suppression_list x
                             where x.email = lower(trim(p.email)) and x.released_at is null)
          else
            exists (select 1 from public.push_tokens t where t.user_id = p.id)
            and coalesce(p.notification_permission, '') <> 'denied'
          end
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
$$;
revoke all on function public.prepare_scheduled_broadcast(uuid, interval, interval) from public, anon, authenticated;

-- A schedule that is switched off or deleted: cancel what was already lined
-- up for later today.
create or replace function public.cancel_stopped_scheduled_sends()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_emails integer;
  v_pushes integer;
begin
  update public.email_send_queue q
     set status = 'failed', failure_type = 'cancelled', error = 'Not sent: the schedule was turned off'
    from public.email_broadcast_history h
   where q.broadcast_id = h.id and h.scheduled_broadcast_id is not null
     and q.status = 'pending' and q.next_attempt_at > now()
     and not exists (select 1 from public.scheduled_broadcasts s where s.id = h.scheduled_broadcast_id and s.is_active);
  get diagnostics v_emails = row_count;

  update public.broadcast_recipients r
     set status = 'cancelled', error_message = 'Schedule turned off', processing_started_at = null
    from public.broadcast_campaigns c
   where r.campaign_id = c.id and c.scheduled_broadcast_id is not null
     and r.status = 'pending' and r.next_attempt_at > now()
     and not exists (select 1 from public.scheduled_broadcasts s where s.id = c.scheduled_broadcast_id and s.is_active);
  get diagnostics v_pushes = row_count;

  return v_emails + v_pushes;
end;
$$;
revoke all on function public.cancel_stopped_scheduled_sends() from public, anon, authenticated;

-- Run the scheduler every 15 minutes while any schedule exists.
select cron.schedule(
  'process-scheduled-broadcasts',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-scheduled-broadcasts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.scheduled_broadcasts);
  $cron$
);

-- The broadcast queue only needs to run when someone is actually due (scheduled
-- pushes wait for each person's local time).
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
  where exists (
    select 1 from public.broadcast_recipients r
    join public.broadcast_campaigns c on c.id = r.campaign_id
    where c.status in ('queued', 'processing')
      and (r.status = 'processing' or (r.status = 'pending' and (r.next_attempt_at is null or r.next_attempt_at <= now())))
  );
  $cron$
);

-- 4. In-app inbox: admin broadcasts saved to profiles also show for people
--    the push couldn't reach (no device / notifications off), not only for
--    people whose push went through.

create or replace function public.get_my_profile_broadcast_messages(p_limit integer default 50, p_offset integer default 0)
returns table(recipient_id uuid, campaign_id uuid, title text, message text, sent_at timestamptz, created_at timestamptz, profile_read_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
begin
  return query
  select br.id as recipient_id,
         br.campaign_id,
         bc.title,
         bc.message,
         coalesce(br.sent_at, br.created_at) as sent_at,
         br.created_at,
         br.profile_read_at
  from broadcast_recipients br
  join broadcast_campaigns bc on br.campaign_id = bc.id
  where br.user_id = auth.uid()
    and br.status in ('sent', 'skipped')
    and bc.save_to_profile = true
    and br.profile_deleted_at is null
  order by coalesce(br.sent_at, br.created_at) desc nulls last
  limit p_limit
  offset p_offset;
end;
$function$;

create or replace function public.get_my_profile_broadcast_unread_count()
returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare
  unread_count integer;
begin
  select count(*)::integer into unread_count
  from broadcast_recipients br
  join broadcast_campaigns bc on br.campaign_id = bc.id
  where br.user_id = auth.uid()
    and br.status in ('sent', 'skipped')
    and bc.save_to_profile = true
    and br.profile_read_at is null
    and br.profile_deleted_at is null;
  return coalesce(unread_count, 0);
end;
$function$;
