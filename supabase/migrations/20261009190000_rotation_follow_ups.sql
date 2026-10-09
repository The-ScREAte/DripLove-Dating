-- Daily rotation: sometimes two pushes a few minutes apart.
--
-- On about 1 in 3 days (active members; Mon, Wed, Fri, Sat, Sun - never the
-- quieter Tuesday and Thursday), one of the day's pushes from midday on gets a
-- second, different message 3-8 minutes later - e.g. 5:00pm and 5:05pm - instead
-- of always one at a time hours apart. The pair stays inside the daily caps
-- (Mon 2, Wed and Fri-Sun 3).
--
-- The second push only goes out right after the first actually went out: if
-- the first was held back or moved later, or they opened the app in between,
-- the second is dropped rather than arriving on its own.
--
-- The planner's message choice and queueing are split into helpers so the
-- second push follows exactly the same rules as the first.

alter table public.broadcast_recipients add column if not exists follow_up boolean not null default false;

-- marketing_push_hold gains p_follow_up (callers with two arguments are unchanged).
drop function if exists public.marketing_push_hold(uuid, boolean);
create or replace function public.marketing_push_hold(p_user_id uuid, p_generic boolean default true, p_follow_up boolean default false)
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

  -- A planned second push a few minutes after another: only right after that
  -- one went out, and the spacing rules don't apply.
  if p_follow_up then
    if v_last_generic is null or v_last_generic < now() - interval '30 minutes' then
      return query select 'no_first_push'::text, null::timestamptz;
      return;
    end if;
    return query select null::text, null::timestamptz;
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
revoke all on function public.marketing_push_hold(uuid, boolean, boolean) from public, anon, authenticated;

create or replace function public.claim_broadcast_recipients(p_campaign_id uuid, p_batch_size integer, p_max_retries integer)
returns table(id uuid, user_id uuid, retry_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quiet boolean;
  v_rotation boolean;
  v_stopped boolean;
  v_day date;
  v_rows integer;
begin
  select coalesce(s.smart_quiet, false),
         coalesce(s.repeat_type = 'rotation', false),
         c.scheduled_broadcast_id is not null
           and (s.id is null or (c.occurrence_time = 'rotation' and not coalesce(s.is_active, false))),
         c.occurrence_date
    into v_quiet, v_rotation, v_stopped, v_day
  from public.broadcast_campaigns c
  left join public.scheduled_broadcasts s on s.id = c.scheduled_broadcast_id
  where c.id = p_campaign_id;
  v_quiet := coalesce(v_quiet, false);
  v_rotation := coalesce(v_rotation, false);

  if coalesce(v_stopped, false) then
    update public.broadcast_recipients r
       set status = 'cancelled', error_message = 'Message turned off or deleted', processing_started_at = null
     where r.campaign_id = p_campaign_id and r.status = 'pending';
    return;
  end if;

  for i in 1..25 loop
    return query
    with to_claim as (
      select r.id, r.user_id, r.follow_up from public.broadcast_recipients r
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
             -- A second push of a pair is never moved: it only makes sense
             -- right after the first.
             case when v_rotation and not tc.follow_up
                       and h.hold_reason in ('recently_active', 'recent_event', 'too_soon')
                       and h.hold_until is not null
                       and h.hold_until + interval '25 minutes'
                           < ((coalesce(v_day, (now() at time zone z.tz)::date) + time '21:00') at time zone z.tz)
                  then h.hold_until + make_interval(mins => 5 + floor(random() * 20)::integer)
             end as retry_at
      from to_claim tc
      left join lateral (
        select hh.hold_reason, hh.hold_until
        from public.marketing_push_hold(tc.user_id, true, tc.follow_up) hh where v_quiet
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

-- The rotation message that fits this member, time and window best.
create or replace function public.pick_rotation_message(
  p_email text, p_country text, p_member_since timestamptz, p_is_premium boolean, p_active boolean,
  p_local_now timestamp, p_window text, p_send_at timestamptz, p_skip_titles text[], p_allow_premium_message boolean
)
returns table(id uuid, title text, audience text)
language sql
security definer
set search_path to ''
as $function$
  select s.id, s.title, s.audience
  from public.scheduled_broadcasts s
  where s.is_active and s.repeat_type = 'rotation' and s.channel = 'push'
    and (s.audience = 'all'
         or (p_allow_premium_message and s.audience = case when p_is_premium then 'premium' else 'free' end))
    and s.activity in ('any', case when p_active then 'active' else 'inactive' end)
    and (coalesce(cardinality(s.specific_days), 0) = 0 or to_char(p_local_now, 'FMday') = any (s.specific_days))
    and (coalesce(cardinality(s.rotation_windows), 0) = 0 or p_window = any (s.rotation_windows))
    and (s.starts_at is null or s.starts_at <= p_send_at)
    and (s.ends_at is null or s.ends_at > p_send_at)
    and (coalesce(cardinality(s.target_countries), 0) = 0 or p_country = any (s.target_countries))
    and (coalesce(cardinality(s.recipient_emails), 0) = 0
         or p_email = any (array(select lower(trim(e)) from unnest(s.recipient_emails) e)))
    and (s.include_new_members or p_member_since <= s.created_at)
    and not (s.title = any (p_skip_titles))
  -- Day- and time-specific messages first (Monday morning, Friday...).
  order by coalesce(cardinality(s.specific_days), 0) > 0 desc,
           coalesce(cardinality(s.rotation_windows), 0) > 0 desc,
           random()
  limit 1;
$function$;
revoke all on function public.pick_rotation_message(text, text, timestamptz, boolean, boolean, timestamp, text, timestamptz, text[], boolean)
  from public, anon, authenticated;

-- Queue one rotation push: one History entry per message and local day.
-- Returns the campaign, or null if this person already has it.
create or replace function public.add_rotation_push(
  p_message_id uuid, p_local_date date, p_user_id uuid, p_send_at timestamptz, p_follow_up boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  v_campaign uuid;
begin
  select b.id, b.title, b.message, b.admin_id, b.save_to_inbox, b.email_fallback
    into s from public.scheduled_broadcasts b where b.id = p_message_id;
  if not found then
    return null;
  end if;

  insert into public.broadcast_campaigns
    (title, message, notification_type, total_recipients, successful_sends, failed_sends, status,
     save_to_profile, email_fallback, admin_id, scheduled_broadcast_id, occurrence_date, occurrence_time)
  values
    (s.title, s.message, 'system', 0, 0, 0, 'processing',
     s.save_to_inbox, s.email_fallback, s.admin_id, s.id, p_local_date, 'rotation')
  on conflict do nothing
  returning id into v_campaign;
  if v_campaign is null then
    select c.id into v_campaign from public.broadcast_campaigns c
    where c.scheduled_broadcast_id = s.id and c.occurrence_date = p_local_date
      and c.occurrence_time = 'rotation' and c.occurrence_at is null;
  else
    update public.scheduled_broadcasts
       set last_sent_at = now(), total_sends = coalesce(total_sends, 0) + 1
     where id = s.id;
  end if;
  if v_campaign is null then
    return null;
  end if;

  insert into public.broadcast_recipients (campaign_id, user_id, status, retry_count, next_attempt_at, follow_up)
  values (v_campaign, p_user_id, 'pending', 0, p_send_at, p_follow_up)
  on conflict do nothing;
  if not found then
    return null;
  end if;
  return v_campaign;
end;
$function$;
revoke all on function public.add_rotation_push(uuid, date, uuid, timestamptz, boolean) from public, anon, authenticated;

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
  v_recent text[];
  v_pitches integer;
  v_pitch_today boolean;
  v_times timestamptz[];
  v_titles text[];
  v_pair boolean;
  v_paired boolean;
  v_count integer;
  v_send_at timestamptz;
  v_follow_at timestamptz;
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

        -- General pushes today: Mon 1, Tue 1, Wed 1-2, Thu 1, Fri-Sun 2.
        -- Away 3+ days: Wed, Fri, Sun; away a week or more: Fridays.
        if v_active then
          v_target := case v_dow when 3 then 1 + (random() < 0.5)::integer
                                 when 5 then 2 when 6 then 2 when 7 then 2 else 1 end;
        elsif u.last_active > now() - interval '7 days' then
          v_target := case when v_dow in (3, 5, 7) then 1 else 0 end;
        else
          v_target := case when v_dow = 5 then 1 else 0 end;
        end if;
        -- About 1 in 3 days one of them comes as a pair, minutes apart.
        v_pair := v_active and v_dow in (1, 3, 5, 6, 7) and random() < 0.35;

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

        -- Messages they've had in the last 14 days (never repeated, by title)
        -- and Premium messages in the last 7 (at most 2 a week, 1 a day).
        select coalesce(array_agg(distinct c.title), '{}'),
               count(*) filter (where s.audience <> 'all' and r.created_at > now() - interval '7 days')
          into v_recent, v_pitches
        from public.broadcast_recipients r
        join public.broadcast_campaigns c on c.id = r.campaign_id
        left join public.scheduled_broadcasts s on s.id = c.scheduled_broadcast_id
        where r.user_id = u.id
          and r.status in ('pending', 'processing', 'sent')
          and r.created_at > now() - interval '14 days';

        v_times := '{}';
        v_titles := '{}';
        v_pitch_today := false;
        v_paired := false;
        v_count := 0;

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
                                where abs(extract(epoch from (t - v_send_at))) < 280 * 60);

          select * into m from public.pick_rotation_message(
            u.email, u.country, u.created_at, u.is_premium, v_active, u.local_now, w.name, v_send_at,
            v_recent || v_titles, v_pitches < 2 and not v_pitch_today);
          continue when not found;
          v_campaign := public.add_rotation_push(m.id, v_today, u.id, v_send_at, false);
          continue when v_campaign is null;

          v_times := v_times || v_send_at;
          v_titles := v_titles || m.title;
          v_pitch_today := v_pitch_today or m.audience <> 'all';
          v_count := v_count + 1;
          if not (v_campaign = any (v_touched)) then
            v_touched := v_touched || v_campaign;
          end if;

          -- The pair: a second, different message 3-8 minutes later (midday
          -- on, finishing before 9pm).
          if v_pair and not v_paired and w.name <> 'morning' and w.local_at::time <= time '20:50' then
            v_follow_at := v_send_at + make_interval(mins => 3 + floor(random() * 6)::integer);
            select * into m from public.pick_rotation_message(
              u.email, u.country, u.created_at, u.is_premium, v_active, u.local_now, w.name, v_follow_at,
              v_recent || v_titles, v_pitches < 2 and not v_pitch_today);
            if found then
              v_campaign := public.add_rotation_push(m.id, v_today, u.id, v_follow_at, true);
              if v_campaign is not null then
                v_paired := true;
                v_titles := v_titles || m.title;
                v_pitch_today := v_pitch_today or m.audience <> 'all';
                v_count := v_count + 1;
                if not (v_campaign = any (v_touched)) then
                  v_touched := v_touched || v_campaign;
                end if;
              end if;
            end if;
          end if;
        end loop;

        update public.push_day_plans set planned = v_count
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
