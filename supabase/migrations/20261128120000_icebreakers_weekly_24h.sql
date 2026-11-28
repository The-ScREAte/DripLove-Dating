-- =====================================================================================
-- "Break the ice": send ONE first message to someone you have not matched with yet.
--
--  * Everyone gets 10 first hellos per 7 days. The week is per person: it starts with their first hello and, once 7 days
--    have passed, simply renews to a fresh 10 (unused ones are NOT added on top).
--  * The person who receives it has 24 HOURS to answer. If they do not, it expires and the person goes back into the
--    sender's Discover queue (the app hides someone only while their hello is waiting, or after they said no).
--  * Accepting = a match + the hello becomes the first chat message. Declining is silent for the sender.
--
-- Supersedes supabase/pending-review/20261127000000_icebreakers_for_review.sql (never applied). Differences:
--   - weekly quota table instead of "4 in total / 10 a day"
--   - 24 hour expiry (expires_at) + a 5-minute cron that tidies up
--   - recipient info carries up to 4 photos; new get_icebreaker_sent / get_icebreaker_pending_targets
--   - notify_like_received is based on the CURRENT live body (it has the x-cron-secret header) + one guard
--
-- Limits live in ONE place: public.icebreaker_limits() (or an app_settings row id = 'icebreaker_limits', e.g.
--   {"weekly": 10, "premium_weekly": 10, "window_days": 7, "expire_hours": 24, "hourly": 10, "max_len": 280}).
--
-- ROLLBACK (manual):
--   select cron.unschedule('expire-icebreakers-every-5-min');
--   drop trigger if exists trg_notify_icebreaker_received on public.icebreakers;
--   drop function if exists public.notify_icebreaker_received();
--   drop function if exists public.send_icebreaker(uuid, text);
--   drop function if exists public.respond_icebreaker(uuid, boolean, boolean);
--   drop function if exists public.get_icebreaker_inbox();
--   drop function if exists public.get_icebreaker_sent();
--   drop function if exists public.get_icebreaker_pending_targets();
--   drop function if exists public.get_icebreaker_quota();
--   drop function if exists public.get_icebreaker_status(uuid);
--   drop function if exists public.expire_icebreakers();
--   drop function if exists public.icebreaker_is_premium(uuid);
--   drop function if exists public.icebreaker_limits();
--   drop table if exists public.icebreaker_quota;
--   drop table if exists public.icebreakers;
--   -- and restore notify_like_received() without the 'app.icebreaker_accept' guard.
-- =====================================================================================

-- ---------- tables ------------------------------------------------------------------
create table if not exists public.icebreakers (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message      text not null check (char_length(message) between 1 and 280),
  status       text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours'),
  responded_at timestamptz,
  match_id     uuid references public.matches(id) on delete set null,
  constraint icebreakers_not_self check (sender_id <> recipient_id)
);

create unique index if not exists icebreakers_one_pending_per_pair
  on public.icebreakers (sender_id, recipient_id) where status = 'pending';
create index if not exists icebreakers_inbox_idx
  on public.icebreakers (recipient_id, status, expires_at desc);
create index if not exists icebreakers_sender_idx
  on public.icebreakers (sender_id, created_at desc);
create index if not exists icebreakers_pending_expiry_idx
  on public.icebreakers (expires_at) where status = 'pending';

alter table public.icebreakers enable row level security;

drop policy if exists "icebreakers_select_involved" on public.icebreakers;
create policy "icebreakers_select_involved" on public.icebreakers
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

revoke all on public.icebreakers from public, anon, authenticated;
grant select on public.icebreakers to authenticated;

-- one row per person: the start of their current 7-day window and how many hellos they sent in it
create table if not exists public.icebreaker_quota (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null default now(),
  used         int not null default 0 check (used >= 0)
);
alter table public.icebreaker_quota enable row level security;
revoke all on public.icebreaker_quota from public, anon, authenticated;
-- no policies on purpose: only the SECURITY DEFINER functions below read or write it

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'icebreakers') then
    alter publication supabase_realtime add table public.icebreakers;
  end if;
end $$;

-- ---------- limits ------------------------------------------------------------------
create or replace function public.icebreaker_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_default constant jsonb := jsonb_build_object(
    'weekly',         10,   -- first hellos per window, free users
    'premium_weekly', 10,   -- first hellos per window, premium
    'window_days',    7,    -- the window renews to a fresh allowance after this many days
    'expire_hours',   24,   -- the other person has this long to answer
    'hourly',         10,   -- max sent per rolling hour
    'max_len',        280
  );
  v_override jsonb;
begin
  begin
    select s.value::jsonb into v_override from public.app_settings s where s.id = 'icebreaker_limits';
  exception when others then
    v_override := null;
  end;
  return v_default || coalesce(v_override, '{}'::jsonb);
end;
$$;

create or replace function public.icebreaker_is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select (s.status in ('active','cancelled','payment_pending')
            and s.plan_name = 'premium'
            and (s.expires_at is null or s.expires_at > now() - interval '30 minutes'))
    from public.user_subscriptions s
    where s.user_id = p_user
    order by s.created_at desc
    limit 1
  ), false);
$$;

-- hellos used in the CURRENT window (0 once the window has run out) and when it renews
create or replace function public.icebreaker_window(p_user uuid, out used int, out resets_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := (public.icebreaker_limits()->>'window_days')::int;
  q      public.icebreaker_quota%rowtype;
begin
  select * into q from public.icebreaker_quota where user_id = p_user;
  if not found or q.window_start + make_interval(days => v_days) <= now() then
    used := 0;
    resets_at := null;      -- no window running: the next hello starts one
  else
    used := q.used;
    resets_at := q.window_start + make_interval(days => v_days);
  end if;
end;
$$;

-- ---------- housekeeping ------------------------------------------------------------
create or replace function public.expire_icebreakers()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  update public.icebreakers set status = 'expired', responded_at = now()
   where status = 'pending' and expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------- send --------------------------------------------------------------------
create or replace function public.send_icebreaker(p_recipient uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me       uuid := auth.uid();
  v_lim      jsonb := public.icebreaker_limits();
  v_msg      text;
  v_premium  boolean;
  v_cap      int;
  v_days     int := (v_lim->>'window_days')::int;
  v_used     int;
  v_resets   timestamptz;
  v_match    uuid;
  v_id       uuid;
  v_expires  timestamptz;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_recipient is null or p_recipient = v_me then
    return jsonb_build_object('ok', false, 'error', 'invalid_recipient');
  end if;

  -- two people sending at the same moment must not both slip past the limit
  perform pg_advisory_xact_lock(hashtextextended('icebreaker:' || v_me::text, 0));

  v_msg := btrim(regexp_replace(coalesce(p_message, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F<>]', '', 'g'));
  if char_length(v_msg) < 1 or char_length(v_msg) > (v_lim->>'max_len')::int then
    return jsonb_build_object('ok', false, 'error', 'invalid_message');
  end if;

  if exists (select 1 from public.profiles p
             where p.id in (v_me, p_recipient) and coalesce(p.account_status, 'active') <> 'active')
     or (select count(*) from public.profiles p where p.id in (v_me, p_recipient)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  select m.id into v_match from public.matches m
  where (m.user1_id = v_me and m.user2_id = p_recipient) or (m.user1_id = p_recipient and m.user2_id = v_me)
  limit 1;
  if v_match is not null then
    return jsonb_build_object('ok', false, 'error', 'already_matched', 'match_id', v_match);
  end if;

  -- they already wrote to you: answer theirs instead (it is waiting in your chats)
  if exists (select 1 from public.icebreakers i
             where i.sender_id = p_recipient and i.recipient_id = v_me and i.status = 'pending' and i.expires_at > now()) then
    return jsonb_build_object('ok', false, 'error', 'reverse_pending');
  end if;

  v_premium := public.icebreaker_is_premium(v_me);
  v_cap := case when v_premium then (v_lim->>'premium_weekly')::int else (v_lim->>'weekly')::int end;
  select w.used, w.resets_at into v_used, v_resets from public.icebreaker_window(v_me) w;

  -- blocked either way, or they already said no: report success, store nothing, spend nothing (never reveals it)
  if exists (select 1 from public.blocks b
             where (b.blocker_id = p_recipient and b.blocked_id = v_me) or (b.blocker_id = v_me and b.blocked_id = p_recipient))
     or exists (select 1 from public.icebreakers i
                where i.sender_id = v_me and i.recipient_id = p_recipient and i.status = 'declined') then
    return jsonb_build_object('ok', true, 'silent', true, 'is_premium', v_premium,
      'limit', v_cap, 'remaining', greatest(v_cap - v_used, 0), 'resets_at', v_resets);
  end if;

  -- one open hello per person; an overdue one is closed so a fresh one can go out
  update public.icebreakers set status = 'expired', responded_at = now()
   where sender_id = v_me and recipient_id = p_recipient and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.icebreakers i
             where i.sender_id = v_me and i.recipient_id = p_recipient and i.status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'already_sent');
  end if;

  if v_used >= v_cap then
    return jsonb_build_object('ok', false, 'error', 'quota_exhausted', 'is_premium', v_premium,
      'limit', v_cap, 'remaining', 0, 'resets_at', v_resets);
  end if;
  if (select count(*) from public.icebreakers where sender_id = v_me and created_at > now() - interval '1 hour')
     >= (v_lim->>'hourly')::int then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  begin
    insert into public.icebreakers (sender_id, recipient_id, message, expires_at)
    values (v_me, p_recipient, v_msg, now() + make_interval(hours => (v_lim->>'expire_hours')::int))
    returning id, expires_at into v_id, v_expires;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_sent');
  end;

  -- spend one: start a new window when none is running (or the old one ran out), otherwise add to it
  insert into public.icebreaker_quota as q (user_id, window_start, used)
  values (v_me, now(), 1)
  on conflict (user_id) do update
    set window_start = case when q.window_start + make_interval(days => v_days) <= now() then now() else q.window_start end,
        used         = case when q.window_start + make_interval(days => v_days) <= now() then 1 else q.used + 1 end
  returning q.window_start + make_interval(days => v_days) into v_resets;

  return jsonb_build_object('ok', true, 'id', v_id, 'is_premium', v_premium, 'expires_at', v_expires,
    'limit', v_cap, 'remaining', greatest(v_cap - (v_used + 1), 0), 'resets_at', v_resets);
end;
$$;

-- ---------- respond -----------------------------------------------------------------
create or replace function public.respond_icebreaker(p_id uuid, p_accept boolean, p_block boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  r        public.icebreakers%rowtype;
  v_match  uuid;
  v_u1     uuid;
  v_u2     uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r from public.icebreakers where id = p_id and recipient_id = v_me for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if r.status = 'accepted' then
    return jsonb_build_object('ok', true, 'status', 'accepted', 'match_id', r.match_id);
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'status', r.status);
  end if;
  if r.expires_at <= now() then
    update public.icebreakers set status = 'expired', responded_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if not coalesce(p_accept, false) then
    update public.icebreakers set status = 'declined', responded_at = now() where id = r.id;
    if coalesce(p_block, false) then
      insert into public.blocks (blocker_id, blocked_id, reason)
      values (v_me, r.sender_id, 'icebreaker')
      on conflict (blocker_id, blocked_id) do nothing;
    end if;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if exists (select 1 from public.blocks b
             where (b.blocker_id = v_me and b.blocked_id = r.sender_id) or (b.blocker_id = r.sender_id and b.blocked_id = v_me)) then
    update public.icebreakers set status = 'declined', responded_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  v_u1 := least(v_me, r.sender_id);
  v_u2 := greatest(v_me, r.sender_id);

  select m.id into v_match from public.matches m
  where (m.user1_id = v_u1 and m.user2_id = v_u2) or (m.user1_id = v_u2 and m.user2_id = v_u1) limit 1;

  if v_match is null then
    -- the "someone liked you" push is skipped for this transaction (guard in notify_like_received below)
    perform set_config('app.icebreaker_accept', '1', true);
    -- sender's like first, accepter's like last: notify_match_created pushes to everyone EXCEPT the latest liker
    insert into public.likes (liker_id, liked_id, created_at)
    values (r.sender_id, v_me, clock_timestamp() - interval '2 seconds') on conflict do nothing;
    insert into public.likes (liker_id, liked_id, created_at)
    values (v_me, r.sender_id, clock_timestamp()) on conflict do nothing;
    perform set_config('app.icebreaker_accept', '', true);

    select m.id into v_match from public.matches m where m.user1_id = v_u1 and m.user2_id = v_u2 limit 1;
    if v_match is null then
      insert into public.matches (user1_id, user2_id, user1_unread_count, user2_unread_count)
      values (v_u1, v_u2, 0, 0)
      on conflict (user1_id, user2_id) do nothing
      returning id into v_match;
      if v_match is null then
        select m.id into v_match from public.matches m where m.user1_id = v_u1 and m.user2_id = v_u2 limit 1;
      end if;
    end if;
  end if;

  insert into public.chats (match_id, sender_id, recipient_id, message, is_read)
  values (v_match, r.sender_id, v_me, r.message, true);
  update public.matches set
    user1_unread_count = case when user1_id = v_me then 0 else user1_unread_count end,
    user2_unread_count = case when user2_id = v_me then 0 else user2_unread_count end
  where id = v_match;

  update public.icebreakers set status = 'accepted', responded_at = now(), match_id = v_match where id = r.id;
  return jsonb_build_object('ok', true, 'status', 'accepted', 'match_id', v_match);
end;
$$;

-- ---------- the other person's public card: first name, age, city, verified, photos ----
create or replace function public.icebreaker_photos(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(x.image_url), '{}')
  from (
    select u.image_url
    from public.user_images u
    where u.user_id = p_user and coalesce(u.is_approved, true) and coalesce(u.moderation_status, 'approved') <> 'rejected'
    order by u.image_order nulls last, u.created_at
    limit 4
  ) x;
$$;

-- ---------- inbox: hellos waiting for ME (24h left on each) -----------------------------
drop function if exists public.get_icebreaker_inbox();
create or replace function public.get_icebreaker_inbox()
returns table (
  id uuid, sender_id uuid, message text, created_at timestamptz, expires_at timestamptz,
  first_name text, age int, city text, is_verified boolean, photo_url text, photos text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.sender_id, i.message, i.created_at, i.expires_at,
         initcap(btrim(p.first_name)),
         case when p.date_of_birth is null then null else date_part('year', age(p.date_of_birth))::int end,
         p.city,
         coalesce(p.is_verified, false),
         (public.icebreaker_photos(p.id))[1],
         public.icebreaker_photos(p.id)
  from public.icebreakers i
  join public.profiles p on p.id = i.sender_id
  where i.recipient_id = auth.uid()
    and i.status = 'pending'
    and i.expires_at > now()
    and coalesce(p.account_status, 'active') = 'active'
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = auth.uid() and b.blocked_id = i.sender_id)
                       or (b.blocker_id = i.sender_id and b.blocked_id = auth.uid()))
  order by i.expires_at asc
  limit 50;
$$;

-- ---------- sent: hellos I sent that are still waiting for an answer ---------------------
create or replace function public.get_icebreaker_sent()
returns table (
  id uuid, recipient_id uuid, message text, created_at timestamptz, expires_at timestamptz,
  first_name text, age int, city text, is_verified boolean, photo_url text, photos text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.recipient_id, i.message, i.created_at, i.expires_at,
         initcap(btrim(p.first_name)),
         case when p.date_of_birth is null then null else date_part('year', age(p.date_of_birth))::int end,
         p.city,
         coalesce(p.is_verified, false),
         (public.icebreaker_photos(p.id))[1],
         public.icebreaker_photos(p.id)
  from public.icebreakers i
  join public.profiles p on p.id = i.recipient_id
  where i.sender_id = auth.uid()
    and i.status = 'pending'
    and i.expires_at > now()
    and coalesce(p.account_status, 'active') = 'active'
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = auth.uid() and b.blocked_id = i.recipient_id)
                       or (b.blocker_id = i.recipient_id and b.blocked_id = auth.uid()))
  order by i.expires_at asc
  limit 50;
$$;

-- people to keep OUT of my Discover queue: a hello is waiting on them, or they said no. An expired hello is not
-- listed, so that person is back in the queue the moment the 24 hours are over.
create or replace function public.get_icebreaker_pending_targets()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct i.recipient_id), '{}')
  from public.icebreakers i
  where i.sender_id = auth.uid()
    and ((i.status = 'pending' and i.expires_at > now()) or i.status = 'declined');
$$;

-- ---------- quota & per-person status -----------------------------------------------------
create or replace function public.get_icebreaker_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_lim     jsonb := public.icebreaker_limits();
  v_premium boolean;
  v_cap     int;
  v_used    int;
  v_resets  timestamptz;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_premium := public.icebreaker_is_premium(v_me);
  v_cap := case when v_premium then (v_lim->>'premium_weekly')::int else (v_lim->>'weekly')::int end;
  select w.used, w.resets_at into v_used, v_resets from public.icebreaker_window(v_me) w;
  return jsonb_build_object(
    'ok', true, 'is_premium', v_premium, 'limit', v_cap, 'used', v_used,
    'remaining', greatest(v_cap - v_used, 0), 'resets_at', v_resets,
    'window_days', (v_lim->>'window_days')::int, 'expire_hours', (v_lim->>'expire_hours')::int);
end;
$$;

create or replace function public.get_icebreaker_status(p_other uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_match   uuid;
  v_expires timestamptz;
begin
  if v_me is null or p_other is null then
    return jsonb_build_object('ok', false);
  end if;
  select m.id into v_match from public.matches m
  where (m.user1_id = v_me and m.user2_id = p_other) or (m.user1_id = p_other and m.user2_id = v_me) limit 1;
  select i.expires_at into v_expires from public.icebreakers i
   where i.sender_id = v_me and i.recipient_id = p_other and i.status = 'pending' and i.expires_at > now()
   limit 1;
  return jsonb_build_object('ok', true, 'matched', v_match is not null, 'match_id', v_match,
                            'pending', v_expires is not null, 'expires_at', v_expires);
end;
$$;

-- ---------- push: same pattern as notify_like_received (x-cron-secret + bearer) -----------------
create or replace function public.notify_icebreaker_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select initcap(btrim(p.first_name)) into v_name from public.profiles p where p.id = new.sender_id;
  perform net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'),
      'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
    ),
    body := jsonb_build_object(
      'title', coalesce(nullif(v_name, ''), 'Someone') || ' broke the ice 💬',
      'body', 'Reply within 24 hours to start chatting',
      'userId', new.recipient_id,
      'type', 'message',
      'category', 'event',
      'kind', 'icebreaker',
      'dedupeKey', 'icebreaker:' || new.sender_id,
      'data', jsonb_build_object('action', 'open_icebreakers', 'senderId', new.sender_id)
    )
  );
  return new;
exception when others then
  raise warning 'notify_icebreaker_received failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_icebreaker_received on public.icebreakers;
create trigger trg_notify_icebreaker_received
  after insert on public.icebreakers
  for each row execute function public.notify_icebreaker_received();

-- ---------- notify_like_received: the LIVE body (x-cron-secret header included) + one guard so accepting a hello does
-- not tell the accepter "someone liked you" for the like we insert on their behalf. ----------------------------------
create or replace function public.notify_like_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.icebreaker_accept', true), '') = '1' then
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

-- ---------- privileges --------------------------------------------------------------
revoke all on function public.icebreaker_limits()                  from public, anon, authenticated;
revoke all on function public.icebreaker_is_premium(uuid)          from public, anon, authenticated;
revoke all on function public.icebreaker_window(uuid)              from public, anon, authenticated;
revoke all on function public.icebreaker_photos(uuid)              from public, anon, authenticated;
revoke all on function public.expire_icebreakers()                 from public, anon, authenticated;
revoke all on function public.notify_icebreaker_received()         from public, anon, authenticated;
revoke all on function public.send_icebreaker(uuid, text)          from public, anon;
revoke all on function public.respond_icebreaker(uuid, boolean, boolean) from public, anon;
revoke all on function public.get_icebreaker_inbox()               from public, anon;
revoke all on function public.get_icebreaker_sent()                from public, anon;
revoke all on function public.get_icebreaker_pending_targets()     from public, anon;
revoke all on function public.get_icebreaker_quota()               from public, anon;
revoke all on function public.get_icebreaker_status(uuid)          from public, anon;
grant execute on function public.send_icebreaker(uuid, text)                to authenticated;
grant execute on function public.respond_icebreaker(uuid, boolean, boolean) to authenticated;
grant execute on function public.get_icebreaker_inbox()                     to authenticated;
grant execute on function public.get_icebreaker_sent()                      to authenticated;
grant execute on function public.get_icebreaker_pending_targets()           to authenticated;
grant execute on function public.get_icebreaker_quota()                     to authenticated;
grant execute on function public.get_icebreaker_status(uuid)                to authenticated;
grant execute on function public.icebreaker_limits(), public.icebreaker_is_premium(uuid), public.expire_icebreakers() to service_role;

-- ---------- tidy-up every 5 minutes (reads already ignore overdue rows; this keeps the table honest) ----
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'expire-icebreakers-every-5-min';
    perform cron.schedule('expire-icebreakers-every-5-min', '*/5 * * * *', 'select public.expire_icebreakers();');
  end if;
end $$;
