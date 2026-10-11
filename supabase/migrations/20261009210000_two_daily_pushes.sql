-- Two daily pushes that go through.
--
-- Smart quiet kept moving some members' pushes until the day ran out, so
-- they got nothing. Now every member with the app gets 2 pushes a day - active
-- or away, any day of the week - at random times at least 4h40m apart:
--
--  * These two are compulsory. If the member is in the app right then (or just
--    got a like, match or message), the push waits about 30 minutes, at most
--    twice, and then goes out anyway. Never 10pm-8am, and never after 9:30pm.
--  * The planner checks each member about hourly: if one of the day's two was
--    dropped (message deleted or paused, quiet hours), it plans a replacement
--    in a later window. A manual broadcast they got today counts as one of the
--    two.
--  * Extras stay optional and follow smart quiet: the quick follow-up a few
--    minutes after a daily push (about 1 day in 3 for active members, not
--    Tue/Thu; never moved), recommendations, streak and game pushes. All
--    marketing pushes together are capped at 3 a day Mon-Thu and 4 Fri-Sun; the
--    two daily pushes always go, the cap only limits extras. An optional push is
--    moved later at most once.
--  * Messages: never repeated within 14 days while there are new ones; once a
--    member has had them all, an older one is reused (never twice in a day).
--    Away members get the "away" messages first, then general ones.

alter table public.broadcast_recipients
  add column if not exists must_send boolean not null default false,
  add column if not exists moved_count smallint not null default 0;

alter table public.push_day_plans add column if not exists checked_at timestamptz;

-- Smart quiet ---------------------------------------------------------------------

drop function if exists public.marketing_push_hold(uuid, boolean, boolean);
create or replace function public.marketing_push_hold(
  p_user_id uuid, p_generic boolean default true, p_follow_up boolean default false, p_compulsory boolean default false
)
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
  v_quiet interval;
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

  if p_compulsory and (extract(hour from v_local) >= 22 or extract(hour from v_local) < 8) then
    return query select 'quiet_hours'::text, null::timestamptz;
    return;
  end if;

  -- The daily pushes only wait while they're in the app right now (30 minutes);
  -- everything else waits 4 hours after app use or a like, match or message.
  v_quiet := case when p_compulsory then interval '30 minutes' else interval '4 hours' end;

  v_last_active := public.user_last_active_at(p_user_id);
  if v_last_active > now() - v_quiet then
    return query select 'recently_active'::text, v_last_active + v_quiet;
    return;
  end if;

  select greatest(
           (select max(l.created_at) from public.push_delivery_log l
             where l.user_id = p_user_id and l.category = 'event' and l.decision = 'sent'
               and l.created_at > now() - v_quiet),
           (select max(m.created_at) from public.matches m
             where (m.user1_id = p_user_id or m.user2_id = p_user_id)
               and m.created_at > now() - v_quiet),
           (select max(c.created_at) from public.chats c
             where c.recipient_id = p_user_id and c.created_at > now() - v_quiet))
    into v_event;
  if v_event is not null then
    return query select 'recent_event'::text, v_event + v_quiet;
    return;
  end if;

  -- The daily pushes aren't limited by the caps or spacing below.
  if p_compulsory then
    return query select null::text, null::timestamptz;
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

  -- Extras for members away a week or more: one a week.
  if v_last_active is null or v_last_active < now() - interval '7 days' then
    if v_sent_week >= 1 then
      return query select 'weekly_budget'::text, null::timestamptz;
      return;
    end if;
    return query select null::text, null::timestamptz;
    return;
  end if;

  -- All marketing pushes together: 3 a day Mon-Thu, 4 Fri-Sun.
  if v_sent_today >= (case when extract(isodow from v_local)::integer >= 5 then 4 else 3 end) then
    return query select 'daily_budget'::text, null::timestamptz;
    return;
  end if;

  -- A planned follow-up a few minutes after a daily push: only right after
  -- that one went out, and the spacing rules don't apply.
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
revoke all on function public.marketing_push_hold(uuid, boolean, boolean, boolean) from public, anon, authenticated;

-- Claiming ------------------------------------------------------------------------

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
      select r.id, r.user_id, r.follow_up, r.must_send, r.moved_count from public.broadcast_recipients r
      where r.campaign_id = p_campaign_id
        and r.status = 'pending'
        and coalesce(r.retry_count, 0) < p_max_retries
        and (r.next_attempt_at is null or r.next_attempt_at <= now())
      order by date_trunc('minute', coalesce(r.next_attempt_at, r.created_at)), r.id
      limit p_batch_size
      for update skip locked
    ),
    judged as (
      select tc.id, tc.must_send, h.hold_reason as held,
             case
               when h.hold_reason is null or h.hold_until is null then null
               -- Daily push: wait at most twice, never past 9:30pm local.
               when tc.must_send then
                 case when tc.moved_count < 2
                           and h.hold_until + interval '12 minutes'
                               < ((coalesce(v_day, (now() at time zone z.tz)::date) + time '21:30') at time zone z.tz)
                      then h.hold_until + make_interval(mins => 2 + floor(random() * 10)::integer)
                 end
               -- Optional rotation push: moved at most once, before 9pm; a
               -- follow-up is never moved.
               when v_rotation and not tc.follow_up and tc.moved_count < 1
                    and h.hold_reason in ('recently_active', 'recent_event', 'too_soon')
                    and h.hold_until + interval '25 minutes'
                        < ((coalesce(v_day, (now() at time zone z.tz)::date) + time '21:00') at time zone z.tz)
                 then h.hold_until + make_interval(mins => 5 + floor(random() * 20)::integer)
             end as retry_at
      from to_claim tc
      left join lateral (
        select hh.hold_reason, hh.hold_until
        from public.marketing_push_hold(tc.user_id, true, tc.follow_up, tc.must_send) hh where v_quiet
      ) h on true
      left join lateral (
        select public.user_timezone(p.timezone, p.country_code) as tz from public.profiles p where p.id = tc.user_id
      ) z on true
    ),
    decided as (
      select j.id, j.held, j.retry_at,
             case when j.held is null then 'processing'
                  when j.retry_at is not null then 'pending'
                  -- Waited enough: a daily push goes out anyway (never overnight).
                  when j.must_send and j.held <> 'quiet_hours' then 'processing'
                  else 'suppressed' end as new_status
      from judged j
    ),
    upd as (
      update public.broadcast_recipients r
         set status = d.new_status,
             processing_started_at = case when d.new_status = 'processing' then now() else null end,
             next_attempt_at = coalesce(d.retry_at, r.next_attempt_at),
             moved_count = r.moved_count + case when d.retry_at is not null then 1 else 0 end,
             error_message = case when d.held is null then r.error_message
                                  when d.retry_at is not null then 'Moved later: ' || d.held
                                  when d.new_status = 'processing' then 'Sent after waiting: ' || d.held
                                  else 'Held back: ' || d.held end
        from decided d
       where r.id = d.id
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

-- Message choice: away members get the away messages first, then general ones.
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
    and (s.activity in ('any', case when p_active then 'active' else 'inactive' end)
         or (not p_active and s.activity = 'active' and s.audience = 'all'))
    and (coalesce(cardinality(s.specific_days), 0) = 0 or to_char(p_local_now, 'FMday') = any (s.specific_days))
    and (coalesce(cardinality(s.rotation_windows), 0) = 0 or p_window = any (s.rotation_windows))
    and (s.starts_at is null or s.starts_at <= p_send_at)
    and (s.ends_at is null or s.ends_at > p_send_at)
    and (coalesce(cardinality(s.target_countries), 0) = 0 or p_country = any (s.target_countries))
    and (coalesce(cardinality(s.recipient_emails), 0) = 0
         or p_email = any (array(select lower(trim(e)) from unnest(s.recipient_emails) e)))
    and (s.include_new_members or p_member_since <= s.created_at)
    and not (s.title = any (p_skip_titles))
  order by s.activity = case when p_active then 'active' else 'inactive' end desc,
           coalesce(cardinality(s.specific_days), 0) > 0 desc,
           coalesce(cardinality(s.rotation_windows), 0) > 0 desc,
           random()
  limit 1;
$function$;

drop function if exists public.add_rotation_push(uuid, date, uuid, timestamptz, boolean);
create or replace function public.add_rotation_push(
  p_message_id uuid, p_local_date date, p_user_id uuid, p_send_at timestamptz, p_follow_up boolean, p_must_send boolean
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

  insert into public.broadcast_recipients
    (campaign_id, user_id, status, retry_count, next_attempt_at, follow_up, must_send)
  values (v_campaign, p_user_id, 'pending', 0, p_send_at, p_follow_up, p_must_send)
  on conflict do nothing;
  if not found then
    return null;
  end if;
  return v_campaign;
end;
$function$;
revoke all on function public.add_rotation_push(uuid, date, uuid, timestamptz, boolean, boolean) from public, anon, authenticated;

-- The planner -------------------------------------------------------------------

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
  v_midnight timestamptz;
  v_dow integer;
  v_active boolean;
  v_need integer;
  v_recent text[];
  v_pitches integer;
  v_pitch_today boolean;
  v_times timestamptz[];
  v_titles text[];
  v_pair boolean;
  v_paired boolean;
  v_added integer;
  v_send_at timestamptz;
  v_follow_at timestamptz;
  v_campaign uuid;
  v_touched uuid[] := '{}';
  v_checked integer := 0;
begin
  if not public.try_acquire_worker_lock('plan-daily-pushes', 300) then
    return 0;
  end if;

  begin
    for u in
      select p.id, lower(trim(p.email)) as email, p.country, p.created_at, z.tz, z.local_now,
             public.user_last_active_at(p.id) as last_active,
             coalesce(us.plan_name = 'premium'
                      and us.status in ('active', 'cancelled', 'payment_pending')
                      and (us.expires_at is null or us.expires_at > now() - interval '30 minutes'), false) as is_premium,
             t.have
      from public.profiles p
      cross join lateral (
        select public.user_timezone(p.timezone, p.country_code) as tz,
               now() at time zone public.user_timezone(p.timezone, p.country_code) as local_now
      ) z
      left join public.push_day_plans d on d.user_id = p.id and d.local_date = z.local_now::date
      -- The day's pushes so far: daily pushes sent or still to come, plus any
      -- other broadcast (manual) they got today.
      cross join lateral (
        select count(*) filter (where c.occurrence_time = 'rotation' and c.occurrence_date = z.local_now::date
                                  and not r.follow_up and r.status in ('pending', 'processing', 'sent'))
             + count(*) filter (where c.occurrence_time is distinct from 'rotation' and r.status = 'sent'
                                  and r.sent_at >= (z.local_now::date::timestamp at time zone z.tz)) as have
        from public.broadcast_recipients r
        join public.broadcast_campaigns c on c.id = r.campaign_id
        where r.user_id = p.id and r.created_at > now() - interval '2 days'
      ) t
      left join public.user_subscriptions us on us.user_id = p.id
      where coalesce(p.account_status, 'active') = 'active'
        and coalesce(p.is_admin, false) = false
        and coalesce(p.notification_permission, '') <> 'denied'
        and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
        and z.local_now::time < time '20:30'
        and t.have < 2
        -- Checked about hourly (planned, or topped up after a drop).
        and (d.checked_at is null or d.checked_at < now() - interval '50 minutes')
      order by d.checked_at nulls first, p.id
      limit p_limit
    loop
      begin
        v_today := u.local_now::date;
        v_midnight := v_today::timestamp at time zone u.tz;
        v_dow := extract(isodow from u.local_now)::integer;
        v_active := coalesce(u.last_active > now() - interval '3 days', false);
        v_need := 2 - u.have;

        -- Titles they've had in the last 14 days and today, today's push times,
        -- Premium messages in the last 7 days.
        select coalesce(array_agg(distinct c.title), '{}'),
               count(*) filter (where s.audience <> 'all' and r.created_at > now() - interval '7 days'),
               coalesce(array_agg(distinct c.title) filter (
                 where (c.occurrence_time = 'rotation' and c.occurrence_date = v_today) or r.sent_at >= v_midnight), '{}'),
               coalesce(array_agg(coalesce(r.sent_at, r.next_attempt_at)) filter (
                 where (c.occurrence_time = 'rotation' and c.occurrence_date = v_today and not r.follow_up)
                    or (c.occurrence_time is distinct from 'rotation' and r.sent_at >= v_midnight)), '{}'),
               coalesce(bool_or(s.audience <> 'all' and c.occurrence_date = v_today), false),
               coalesce(bool_or(r.follow_up and c.occurrence_date = v_today), false)
          into v_recent, v_pitches, v_titles, v_times, v_pitch_today, v_paired
        from public.broadcast_recipients r
        join public.broadcast_campaigns c on c.id = r.campaign_id
        left join public.scheduled_broadcasts s on s.id = c.scheduled_broadcast_id
        where r.user_id = u.id
          and r.status in ('pending', 'processing', 'sent')
          and r.created_at > now() - interval '14 days';

        -- About 1 day in 3, an active member's daily push gets a follow-up.
        v_pair := v_active and not v_paired and v_dow in (1, 3, 5, 6, 7) and random() < 0.35;
        v_added := 0;

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
          exit when v_added >= v_need;
          v_send_at := w.local_at at time zone u.tz;
          continue when v_send_at < now() + interval '10 minutes';
          continue when exists (select 1 from unnest(v_times) t
                                where abs(extract(epoch from (t - v_send_at))) < 280 * 60);

          -- Something new to them in 14 days; if they've had everything, an
          -- older one (never one they already had today).
          select * into m from public.pick_rotation_message(
            u.email, u.country, u.created_at, u.is_premium, v_active, u.local_now, w.name, v_send_at,
            v_recent || v_titles, v_active and v_pitches < 2 and not v_pitch_today);
          if not found then
            select * into m from public.pick_rotation_message(
              u.email, u.country, u.created_at, u.is_premium, v_active, u.local_now, w.name, v_send_at,
              v_titles, false);
          end if;
          continue when not found;

          v_campaign := public.add_rotation_push(m.id, v_today, u.id, v_send_at, false, true);
          continue when v_campaign is null;
          v_times := v_times || v_send_at;
          v_titles := v_titles || m.title;
          v_pitch_today := v_pitch_today or m.audience <> 'all';
          v_added := v_added + 1;
          if not (v_campaign = any (v_touched)) then
            v_touched := v_touched || v_campaign;
          end if;

          -- The follow-up: a second, different message 3-8 minutes later
          -- (midday on, finishing before 9pm). Optional.
          if v_pair and not v_paired and w.name <> 'morning' and w.local_at::time <= time '20:50' then
            v_follow_at := v_send_at + make_interval(mins => 3 + floor(random() * 6)::integer);
            select * into m from public.pick_rotation_message(
              u.email, u.country, u.created_at, u.is_premium, v_active, u.local_now, w.name, v_follow_at,
              v_recent || v_titles, v_pitches < 2 and not v_pitch_today);
            if found then
              v_campaign := public.add_rotation_push(m.id, v_today, u.id, v_follow_at, true, false);
              if v_campaign is not null then
                v_paired := true;
                v_titles := v_titles || m.title;
                v_pitch_today := v_pitch_today or m.audience <> 'all';
                if not (v_campaign = any (v_touched)) then
                  v_touched := v_touched || v_campaign;
                end if;
              end if;
            end if;
          end if;
        end loop;

        insert into public.push_day_plans (user_id, local_date, planned, checked_at)
        values (u.id, v_today, u.have + v_added, now())
        on conflict (user_id, local_date) do update set planned = excluded.planned, checked_at = now();
        v_checked := v_checked + 1;
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
  return v_checked;
end;
$function$;
revoke all on function public.plan_daily_pushes(integer) from public, anon, authenticated;

-- Today's planned pushes become today's two daily pushes.
update public.broadcast_recipients r
   set must_send = true
  from public.broadcast_campaigns c
 where c.id = r.campaign_id and c.occurrence_time = 'rotation' and not r.follow_up and r.status = 'pending';

-- More general messages, so two a day rarely repeats within 14 days.
insert into public.scheduled_broadcasts
  (channel, title, message, repeat_type, time_to_send, is_active, total_sends, admin_id, audience, activity,
   specific_days, rotation_windows, send_window_minutes, smart_quiet, save_to_inbox, email_fallback, include_new_members)
select 'push', v.title, v.message, 'rotation', '09:00', true, 0,
       (select b.admin_id from public.scheduled_broadcasts b where b.repeat_type = 'rotation' order by b.created_at limit 1),
       'all', 'active', null, v.windows, 0, true, false, false, true
from (values
  ('Fresh faces today 🌼', 'Take a look at who''s on DripLove today.', null::text[]),
  ('One small step 💌', 'A like or a hello today could be the start of something real.', null::text[]),
  ('Make today count ✨', 'Spend a few minutes on DripLove and see who catches your eye.', array['morning', 'midday']),
  ('Your type is out there 💘', 'Keep exploring. The right person could be one profile away.', null::text[]),
  ('End the day well 🌙', 'Before you sleep, see who''s on DripLove tonight.', array['evening']),
  ('Stand out ⭐', 'A complete profile gets more attention. Add a new photo or a few details.', array['morning', 'midday', 'afternoon']),
  ('Say something real 💬', 'Thoughtful messages get better replies. Try one today.', array['afternoon', 'early_evening', 'evening']),
  ('Open to something new? 🌍', 'Meet people who share your values. Take a look today.', null::text[])
) as v(title, message, windows)
where not exists (select 1 from public.scheduled_broadcasts b where b.title = v.title);
 