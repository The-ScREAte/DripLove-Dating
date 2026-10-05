-- 1) Likes and matches are announced by the server, the moment they happen.
--    They used to be sent from the LIKER's phone, behind rules that looked at
--    the liker's own activity ("send after the liker has liked 3 people, or
--    2 hours, and only if the liker isn't using the app") - and a match push
--    was skipped if the person who completed it had swiped in the last
--    minute, which is always. So almost nobody was told they were liked or
--    matched. Older app versions may still send their own; the dedupe keys
--    below make sure each like/match is only announced once.
-- 2) Admin push broadcasts reach everyone: people the push can't reach (no
--    app, notifications off) or whose push fails get the same message by
--    email (see process-broadcast-queue).
-- 3) Scheduled pushes include people without the app, who get the email at
--    their local time instead.
-- 4) The welcome push is an account notice (never held back by reminder caps).

-- 1. Likes and matches -------------------------------------------------------------

create or replace function public.notify_like_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A like back creates a match; the match notification covers that.
  if exists (select 1 from public.likes l where l.liker_id = new.liked_id and l.liked_id = new.liker_id) then
    return new;
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.liked_id and b.blocked_id = new.liker_id)
       or (b.blocker_id = new.liker_id and b.blocked_id = new.liked_id)
  ) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
    ),
    -- Who liked you is a Premium feature: the liker is only in the dedupe
    -- key (never shown), not in the push data.
    body := jsonb_build_object(
      'title', 'Someone liked you 👀',
      'body', 'See who''s interested in you',
      'userId', new.liked_id,
      'type', 'like',
      'category', 'event',
      'kind', 'like',
      'dedupeKey', 'like:' || new.liker_id,
      'data', jsonb_build_object('action', 'open_liked_me')
    )
  );
  return new;
exception when others then
  raise warning 'notify_like_received failed: %', sqlerrm;
  return new;
end;
$$;

-- Named to sort after trigger_create_match_on_mutual_like (AFTER triggers
-- fire alphabetically), so a mutual like's match already exists by now.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trigger_notify_like_received'
                 and tgrelid = 'public.likes'::regclass) then
    create trigger trigger_notify_like_received
      after insert on public.likes
      for each row execute function public.notify_like_received();
  end if;
end $$;

create or replace function public.notify_match_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trigger_user uuid;
  v_target uuid;
  v_other uuid;
  v_name text;
begin
  -- The person whose like completed the match is in the app watching the
  -- match animation; tell the other one.
  select l.liker_id into v_trigger_user
  from public.likes l
  where (l.liker_id = new.user1_id and l.liked_id = new.user2_id)
     or (l.liker_id = new.user2_id and l.liked_id = new.user1_id)
  order by l.created_at desc
  limit 1;

  for v_target in
    select u from unnest(array[new.user1_id, new.user2_id]) as u
    where v_trigger_user is null or u <> v_trigger_user
  loop
    v_other := case when v_target = new.user1_id then new.user2_id else new.user1_id end;
    select initcap(btrim(p.first_name)) into v_name from public.profiles p where p.id = v_other;

    perform net.http_post(
      url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
      ),
      body := jsonb_build_object(
        'title', 'It''s a match 🎉',
        'body', 'You and ' || coalesce(nullif(v_name, ''), 'someone') || ' matched - say hello',
        'userId', v_target,
        'type', 'match',
        'category', 'event',
        'kind', 'match',
        'dedupeKey', 'match:' || v_other,
        'data', jsonb_build_object('matchId', new.id, 'senderId', v_other)
      )
    );
  end loop;
  return new;
exception when others then
  raise warning 'notify_match_created failed: %', sqlerrm;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trigger_notify_match_created'
                 and tgrelid = 'public.matches'::regclass) then
    create trigger trigger_notify_match_created
      after insert on public.matches
      for each row execute function public.notify_match_created();
  end if;
end $$;

-- 2. Email copy of push broadcasts ------------------------------------------------

alter table public.broadcast_campaigns
  add column if not exists emailed_sends integer not null default 0;
alter table public.email_broadcast_history
  add column if not exists push_campaign_id uuid;
create unique index if not exists email_broadcast_history_push_campaign_idx
  on public.email_broadcast_history (push_campaign_id)
  where push_campaign_id is not null;

-- 3. Scheduled pushes also reach people without the app (by email) -------------

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
      and (
        -- Reachable by email (email schedules; and push schedules for people
        -- the push can't reach)...
        (p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
         and not exists (select 1 from public.email_suppression_list x
                         where x.email = lower(trim(p.email)) and x.released_at is null))
        -- ...or, for push schedules, by push.
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
$$;
revoke all on function public.prepare_scheduled_broadcast(uuid, interval, interval) from public, anon, authenticated;

-- 4. Welcome push is an account notice -----------------------------------------

create or replace function public.process_pending_welcome_notifications()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec record;
begin
  for rec in
    select id, user_id
    from public.pending_welcome_notifications
    where sent = false and send_at <= now()
    order by send_at
    limit 50
  loop
    perform net.http_post(
      url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
      ),
      body := jsonb_build_object(
        'title', 'Welcome to DripLove',
        'body', 'Complete your profile — reach the right people',
        'userId', rec.user_id,
        'type', 'system',
        'category', 'transactional',
        'kind', 'welcome',
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    update public.pending_welcome_notifications
      set sent = true
      where id = rec.id;
  end loop;
end;
$function$;

-- 5. Turning a schedule off also closes that day's History entry once
--    nothing is left to send (otherwise it stayed "processing").

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

  update public.broadcast_campaigns c
     set status = 'completed'
   where c.scheduled_broadcast_id is not null and c.status in ('queued', 'processing')
     and not exists (select 1 from public.broadcast_recipients r
                     where r.campaign_id = c.id and r.status in ('pending', 'processing'));

  return v_emails + v_pushes;
end;
$$;
revoke all on function public.cancel_stopped_scheduled_sends() from public, anon, authenticated;
