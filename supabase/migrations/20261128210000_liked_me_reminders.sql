-- Liked Me: instant "someone liked you" push + up to 4 reminders a day about undecided likes.
--
-- 1. notify_like_received (trigger on likes, AFTER INSERT): unchanged logic (skips hellos via the
--    app.icebreaker_accept / app.icebreaker_send guards, mutual likes - the match push covers those -
--    and blocks either way). Copy is emoji-free now. Still category 'event', so like every other
--    real-person event it goes out immediately (no quiet hours), dedupe 'like:<liker>'.
--
-- 2. send_like_reminders() - cron 'send-like-reminders-hourly' at :20 every hour.
--    For each member with incoming likes they haven't decided on (see undecided_likers):
--      * at most 4 a local day (like_reminder_settings), and never more than the number of
--        undecided likers - 10 waiting = 4 a day, each about a different person; 1 waiting = 1 a day.
--      * at random times: the waking day (08:00-22:00 local) is cut into 4 equal parts and each part
--        gets a random minute (fixed per member per day); a reminder is due once its time has passed.
--        Never 22:00-08:00 local.
--      * never while they're in the app right now or just got a like/match/message
--        (marketing_push_hold, compulsory mode), never within 45 minutes of any other push or
--        another reminder; a held reminder is retried the next hour.
--      * a different liker each time: never the same liker twice in a day, and not again within
--        3 days unless everyone else has been reminded more recently; least-recently-reminded first.
--      * stops for a liker the moment it's decided (liked back / matched / passed / blocked) or the
--        liker leaves (not active, archived), and stops for good once the like is 14 days old.
--      * free members never see who: no name and no photo. Premium members get the first name and photo.
--      * tap opens Liked Me (action open_liked_me).
--    Category 'like_reminder': push_eligibility lets it through for every tier except 22:00-08:00
--    (same treatment as the daily recommendations), it doesn't count toward the marketing budget,
--    and it's never emailed when the phone can't be reached.

-- Settings: one place to change the rules ----------------------------------------------------

create or replace function public.like_reminder_settings()
returns table(
  enabled boolean,
  max_per_day integer,
  min_like_age interval,     -- leave the instant push alone for a while
  max_like_age interval,     -- stop reminding about a like after this long
  repeat_gap interval,       -- don't remind about the same liker again within this
  spacing interval,          -- min gap to any other push / reminder
  day_start_hour integer,    -- local waking window [start, end)
  day_end_hour integer
)
language sql
immutable
set search_path to ''
as $function$
  select true, 4, interval '2 hours', interval '14 days', interval '3 days', interval '45 minutes', 8, 22;
$function$;

-- Log of sent reminders (server-only) -----------------------------------------------------------

create table if not exists public.like_reminder_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  local_day date not null,
  slot integer not null,
  sent_at timestamptz not null default now(),
  dedupe_key text not null,
  unique (user_id, liker_id, local_day)
);
create index if not exists like_reminder_log_user_sent_idx on public.like_reminder_log (user_id, sent_at desc);

alter table public.like_reminder_log enable row level security;
-- No policies: clients can't read or write it.
revoke all on public.like_reminder_log from anon, authenticated;
revoke all on sequence public.like_reminder_log_id_seq from anon, authenticated;

-- 1. Instant like push (live definition + emoji-free copy) ----------------------------------------

create or replace function public.notify_like_received()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(current_setting('app.icebreaker_accept', true), '') = '1'
     or coalesce(current_setting('app.icebreaker_send', true), '') = '1' then
    return new;
  end if;
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
      'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'), 'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
    ),
    body := jsonb_build_object(
      'title', 'Someone liked you',
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
$function$;

-- push_eligibility: live definition + a 'like_reminder' branch --------------------------------

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

  -- Daily recommendations and Liked Me reminders: their sender already paces
  -- them (caps, spacing, holds); here they're only never at night.
  if v_cat in ('recommendation', 'like_reminder') then
    if v_hour >= 22 or v_hour < 8 then
      return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
    return query select true, v_cat, v_tier, v_hour; return;
  end if;

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

-- 2. Undecided likers --------------------------------------------------------------------------

create or replace function public.undecided_likers(p_user_id uuid, p_now timestamptz default null)
returns table(liker_id uuid, liked_at timestamptz, first_name text)
language sql
stable
security definer
set search_path to ''
as $function$
  select l.liker_id, l.created_at, nullif(trim(lp.first_name), '')
  from public.likes l
  join public.profiles lp on lp.id = l.liker_id
  cross join public.like_reminder_settings() s
  where l.liked_id = p_user_id
    and l.liker_id <> p_user_id
    and l.created_at < coalesce(p_now, now()) - s.min_like_age
    and l.created_at > coalesce(p_now, now()) - s.max_like_age
    and lp.account_status = 'active'
    and lp.is_archived is not true
    and lp.is_admin is not true
    -- liked back (a match follows), matched, passed, blocked either way, or a hello pending
    and not exists (select 1 from public.likes b where b.liker_id = p_user_id and b.liked_id = l.liker_id)
    and not exists (
      select 1 from public.matches m
      where (m.user1_id = p_user_id and m.user2_id = l.liker_id) or (m.user1_id = l.liker_id and m.user2_id = p_user_id))
    and not exists (
      select 1 from public.passes ps
      where ps.passer_id = p_user_id and ps.passed_id = l.liker_id and ps.passed_at >= coalesce(p_now, now()) - interval '30 days')
    and not exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = p_user_id and bl.blocked_id = l.liker_id) or (bl.blocker_id = l.liker_id and bl.blocked_id = p_user_id))
    and not exists (
      select 1 from public.icebreakers i
      where i.status = 'pending'
        and ((i.sender_id = l.liker_id and i.recipient_id = p_user_id) or (i.sender_id = p_user_id and i.recipient_id = l.liker_id)));
$function$;

-- Copy (emoji-free). Free members: never who. Premium: first name. ------------------------------

create or replace function public.like_reminder_copy(p_variant integer, p_premium boolean, p_name text, p_count integer)
returns table(title text, body text)
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v integer := mod(abs(coalesce(p_variant, 0)), 4);
  n integer := greatest(coalesce(p_count, 1), 1);
  nm text := nullif(trim(coalesce(p_name, '')), '');
begin
  if p_premium and nm is not null then
    title := case v
      when 0 then nm || ' liked you. Say hi?'
      when 1 then nm || ' is waiting on your answer'
      when 2 then 'Don''t leave ' || nm || ' hanging'
      else nm || ' likes you' end;
    body := case v
      when 0 then 'Like them back to start chatting.'
      when 1 then 'Match or pass? It only takes a second.'
      when 2 then nm || ' liked you. Like back to match.'
      else case when n > 1 then 'And ' || (n - 1) || ' more ' || case when n = 2 then 'like is' else 'likes are' end || ' waiting.'
                else 'Match or pass? It only takes a second.' end end;
  else
    title := case v
      when 0 then 'Someone is still waiting on your answer'
      when 1 then 'A like is waiting for you'
      when 2 then case when n > 1 then 'You have ' || n || ' likes waiting' else 'You have a like waiting' end
      else 'Someone likes you. Like them back?' end;
    body := case v
      when 0 then 'Open Liked Me to match or pass.'
      when 1 then 'Match or pass? It only takes a second.'
      when 2 then 'See who''s interested in you.'
      else 'Open Liked Me and make your move.' end;
  end if;
  return next;
end;
$function$;

-- The reminder sender ----------------------------------------------------------------------------
-- p_now / p_only_users exist for dry runs: with a simulated p_now, the live-clock checks
-- (marketing_push_hold, push_delivery_log spacing) are skipped; everything else uses p_now.

create or replace function public.send_like_reminders(p_now timestamptz default null, p_only_users uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  rec record;
  v_now timestamptz := coalesce(p_now, now());
  v_live boolean := p_now is null or abs(extract(epoch from (p_now - now()))) < 120;
  v_local timestamp;
  v_day date;
  v_min integer;
  v_seg integer;
  v_cap integer;
  v_sent_today integer;
  v_due integer;
  v_hold text;
  v_liker record;
  v_premium boolean;
  v_title text;
  v_body text;
  v_data jsonb;
  v_key text;
  v_sent integer := 0;
begin
  select * into s from public.like_reminder_settings();
  if not s.enabled then
    return 0;
  end if;
  v_seg := ((s.day_end_hour - s.day_start_hour) * 60) / greatest(s.max_per_day, 1);

  for rec in
    with targets as (
      select distinct l.liked_id as uid
      from public.likes l
      where l.created_at < v_now - s.min_like_age
        and l.created_at > v_now - s.max_like_age
        and (p_only_users is null or l.liked_id = any(p_only_users))
    )
    select p.id, public.user_timezone(p.timezone, p.country_code) as tz
    from targets t
    join public.profiles p on p.id = t.uid
    where p.account_status = 'active'
      and p.is_admin is not true
      and coalesce(p.notification_permission, '') <> 'denied'
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
  loop
    begin
      v_local := v_now at time zone rec.tz;
      v_day := v_local::date;
      v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
      continue when v_min < s.day_start_hour * 60 or v_min >= s.day_end_hour * 60;

      select least(s.max_per_day, count(*))::int into v_cap from public.undecided_likers(rec.id, v_now);
      continue when v_cap = 0;

      select count(*) into v_sent_today from public.like_reminder_log g where g.user_id = rec.id and g.local_day = v_day;
      continue when v_sent_today >= v_cap;

      -- Slots: part k of the waking day + a random minute inside its first (length - 30) minutes.
      select count(*) into v_due
      from generate_series(0, s.max_per_day - 1) k
      where s.day_start_hour * 60 + k * v_seg
            + mod(abs(hashtext(rec.id::text || v_day::text || k::text)), greatest(v_seg - 30, 1)) <= v_min;
      continue when v_sent_today >= v_due;

      continue when exists (
        select 1 from public.like_reminder_log g
        where g.user_id = rec.id and g.sent_at > v_now - s.spacing and g.sent_at <= v_now);

      if v_live then
        select h.hold_reason into v_hold from public.marketing_push_hold(rec.id, false, false, true) h;
        continue when v_hold is not null;
        continue when exists (
          select 1 from public.push_delivery_log l
          where l.user_id = rec.id and l.decision = 'sent' and l.created_at > now() - s.spacing);
      end if;

      -- A different liker: not already today; prefer not reminded within repeat_gap; oldest reminder first.
      select u.liker_id, u.first_name, lr.last_at into v_liker
      from public.undecided_likers(rec.id, v_now) u
      left join lateral (
        select max(g.sent_at) as last_at from public.like_reminder_log g
        where g.user_id = rec.id and g.liker_id = u.liker_id
      ) lr on true
      where not exists (
        select 1 from public.like_reminder_log g
        where g.user_id = rec.id and g.liker_id = u.liker_id and g.local_day = v_day)
      order by (lr.last_at is not null and lr.last_at > v_now - s.repeat_gap),
               lr.last_at nulls first,
               hashtext(rec.id::text || v_day::text || u.liker_id::text)
      limit 1;
      continue when v_liker.liker_id is null;

      select exists (
        select 1 from public.user_subscriptions us
        where us.user_id = rec.id and us.plan_name = 'premium'
          and us.status in ('active', 'cancelled')
          and (us.expires_at is null or us.expires_at > now())
      ) into v_premium;

      select c.title, c.body into v_title, v_body
      from public.like_reminder_copy(
        abs(hashtext(rec.id::text || v_day::text)) + v_sent_today,
        v_premium, v_liker.first_name,
        (select count(*)::int from public.undecided_likers(rec.id, v_now))) c;

      v_key := 'like_reminder:' || v_liker.liker_id || ':' || v_day;
      v_data := jsonb_build_object('action', 'open_liked_me');
      if v_premium then
        -- senderId = the liker's photo on the notification; premium only.
        v_data := v_data || jsonb_build_object('senderId', v_liker.liker_id);
      end if;

      insert into public.like_reminder_log (user_id, liker_id, local_day, slot, sent_at, dedupe_key)
      values (rec.id, v_liker.liker_id, v_day, v_sent_today, v_now, v_key)
      on conflict (user_id, liker_id, local_day) do nothing;
      continue when not found;

      perform net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'),
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'userId', rec.id,
          'type', 'system',
          'category', 'like_reminder',
          'kind', 'like_reminder',
          'dedupeKey', v_key,
          'data', v_data
        )
      );
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'send_like_reminders: skipping user % after error: %', rec.id, sqlerrm;
    end;
  end loop;

  -- Keep 30 days of history.
  delete from public.like_reminder_log where sent_at < v_now - interval '30 days';
  return v_sent;
end;
$function$;

-- Permissions -------------------------------------------------------------------------------------

revoke all on function public.undecided_likers(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.send_like_reminders(timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.like_reminder_copy(integer, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.like_reminder_settings() from public, anon, authenticated;
grant execute on function public.undecided_likers(uuid, timestamptz) to service_role;
grant execute on function public.send_like_reminders(timestamptz, uuid[]) to service_role;

-- Cron ---------------------------------------------------------------------------------------------

select cron.schedule('send-like-reminders-hourly', '20 * * * *', 'select public.send_like_reminders();');
