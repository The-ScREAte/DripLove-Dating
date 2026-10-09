-- Scheduled messages behave cleanly when edited, paused, deleted or re-added
-- from the admin screen, without anyone tending them:
--
--  * Pausing or deleting a message cancels everything of it that hasn't gone
--    out yet, immediately (not at the next 15-minute run), and the queue
--    refuses to send for a deleted message or a paused rotation message.
--  * Editing a rotation message's text updates the pushes still waiting today.
--  * "Never the same message within 14 days" is by title, so deleting a message
--    and adding it again doesn't resend it to people who just had it.
--  * send_schedule_test sends a message to a few named accounts right away, so
--    a new message can be checked on a test phone without reaching everyone.

create or replace function public.stop_schedule_sends(p_schedule_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pushes integer;
  v_emails integer;
begin
  update public.broadcast_recipients r
     set status = 'cancelled', error_message = p_reason, processing_started_at = null
    from public.broadcast_campaigns c
   where r.campaign_id = c.id and c.scheduled_broadcast_id = p_schedule_id and r.status = 'pending';
  get diagnostics v_pushes = row_count;

  update public.email_send_queue q
     set status = 'failed', failure_type = 'cancelled', error = 'Not sent: ' || p_reason
    from public.email_broadcast_history h
   where q.broadcast_id = h.id and h.scheduled_broadcast_id = p_schedule_id and q.status = 'pending';
  get diagnostics v_emails = row_count;

  update public.broadcast_campaigns c
     set status = 'completed'
   where c.scheduled_broadcast_id = p_schedule_id and c.status in ('queued', 'processing')
     and not exists (select 1 from public.broadcast_recipients r
                     where r.campaign_id = c.id and r.status in ('pending', 'processing'));
  return v_pushes + v_emails;
end;
$function$;
revoke all on function public.stop_schedule_sends(uuid, text) from public, anon, authenticated;

create or replace function public.scheduled_broadcasts_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.stop_schedule_sends(old.id, 'Message deleted');
    delete from public.scheduled_broadcast_deliveries d where d.schedule_id = old.id;
    return old;
  end if;

  if coalesce(old.is_active, false) and not coalesce(new.is_active, false) then
    perform public.stop_schedule_sends(new.id, 'Message turned off');
  end if;

  -- New wording reaches today's rotation pushes that haven't gone out yet.
  -- Changes to who it's for apply from members' next daily plan.
  if new.repeat_type = 'rotation'
     and (new.title is distinct from old.title or new.message is distinct from old.message) then
    update public.broadcast_campaigns c
       set title = new.title, message = new.message
     where c.scheduled_broadcast_id = new.id and c.occurrence_time = 'rotation'
       and c.status in ('queued', 'processing');
  end if;
  return new;
end;
$function$;

drop trigger if exists scheduled_broadcasts_before_delete on public.scheduled_broadcasts;
create trigger scheduled_broadcasts_before_delete
  before delete on public.scheduled_broadcasts
  for each row execute function public.scheduled_broadcasts_lifecycle();

drop trigger if exists scheduled_broadcasts_after_update on public.scheduled_broadcasts;
create trigger scheduled_broadcasts_after_update
  after update on public.scheduled_broadcasts
  for each row execute function public.scheduled_broadcasts_lifecycle();

-- The queue double-checks: nothing goes out for a deleted message or a paused
-- rotation message.
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

-- Send a message to a few named accounts right away (admin only).
create or replace function public.send_schedule_test(p_schedule_id uuid, p_emails text[])
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  v_campaign uuid;
  v_count integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admin access required';
  end if;
  if coalesce(cardinality(p_emails), 0) = 0 or cardinality(p_emails) > 20 then
    raise exception 'Enter 1 to 20 email addresses';
  end if;
  select * into s from public.scheduled_broadcasts b where b.id = p_schedule_id;
  if not found then
    raise exception 'Message not found';
  end if;

  insert into public.broadcast_campaigns
    (title, message, notification_type, total_recipients, successful_sends, failed_sends, status,
     save_to_profile, email_fallback, admin_id)
  values (s.title, s.message, 'system', 0, 0, 0, 'queued', false, false, auth.uid())
  returning id into v_campaign;

  insert into public.broadcast_recipients (campaign_id, user_id, status, retry_count, next_attempt_at)
  select v_campaign, p.id, 'pending', 0, now()
  from public.profiles p
  where lower(trim(p.email)) = any (array(select lower(trim(e)) from unnest(p_emails) e))
  on conflict do nothing;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    delete from public.broadcast_campaigns where id = v_campaign;
    return 0;
  end if;
  update public.broadcast_campaigns set total_recipients = v_count where id = v_campaign;
  perform public.kick_notification_worker('process-broadcast-queue');
  return v_count;
end;
$function$;
revoke all on function public.send_schedule_test(uuid, text[]) from public, anon;
grant execute on function public.send_schedule_test(uuid, text[]) to authenticated;

-- Never the same message twice in 14 days - by title, so a message that was
-- deleted and added again isn't resent to people who just had it.
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
  v_msgs uuid[];
  v_titles text[];
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
        v_msgs := '{}';
        v_titles := '{}';
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
            and not (s.title = any (v_recent))
            and not (s.title = any (v_titles))
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
          v_titles := v_titles || m.title;
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
