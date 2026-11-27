-- =====================================================================================
-- "Break the ice": send ONE first message to someone you have not matched with yet.
-- The recipient sees it in an inbox and must ACCEPT before a match + chat exist.
--
-- *** FOR REVIEW - NOT APPLIED. Nothing here has been run against the live project. ***
-- The app feature-detects these objects: until this migration is applied the Break the ice
-- button simply stays hidden (no errors, no toasts).
--
-- Design (mirrors existing patterns found in the live schema):
--  * Messages live in public.chats (match_id, sender_id, recipient_id, message); matches use
--    (user1_id, user2_id) with LEAST/GREATEST ordering; a match is created by the
--    create_match_on_mutual_like trigger when BOTH likes exist (like_and_usage_batched does the same).
--  * Accepting = insert both likes (mutual-like trigger creates the match) + insert the icebreaker
--    text as the FIRST chat message from the sender. Declining is silent for the sender.
--  * Premium = same rule as get_current_subscription_status (read-only copy, no UPDATE side effects).
--  * Push goes through the existing pattern: DB trigger -> net.http_post -> send-push-notification
--    (category 'event', kind 'icebreaker'), so users' notification settings are respected there.
--
-- QUOTA / LIMITS - change them in ONE place: public.icebreaker_limits() below (or insert an
-- app_settings row with id = 'icebreaker_limits' and a json value, e.g.
--   {"free_total": 4, "premium_daily": 10, "hourly": 10, "expire_days": 14, "max_len": 280}).
--
-- ROLLBACK (manual, if ever needed):
--   drop trigger if exists trg_notify_icebreaker_received on public.icebreakers;
--   drop function if exists public.notify_icebreaker_received();
--   drop function if exists public.send_icebreaker(uuid, text);
--   drop function if exists public.respond_icebreaker(uuid, boolean, boolean);
--   drop function if exists public.get_icebreaker_inbox();
--   drop function if exists public.get_icebreaker_quota();
--   drop function if exists public.get_icebreaker_status(uuid);
--   drop function if exists public.expire_icebreakers();
--   drop function if exists public.icebreaker_is_premium(uuid);
--   drop function if exists public.icebreaker_limits();
--   drop table if exists public.icebreakers;
--   -- and restore notify_like_received() from migrations (the only change is the guard at its top).
-- =====================================================================================

-- ---------- table -------------------------------------------------------------------
create table if not exists public.icebreakers (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message      text not null check (char_length(message) between 1 and 280),
  status       text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  match_id     uuid references public.matches(id) on delete set null,
  constraint icebreakers_not_self check (sender_id <> recipient_id)
);

-- one open icebreaker per pair
create unique index if not exists icebreakers_one_pending_per_pair
  on public.icebreakers (sender_id, recipient_id) where status = 'pending';
-- recipient inbox
create index if not exists icebreakers_inbox_idx
  on public.icebreakers (recipient_id, status, created_at desc);
-- sender quota counting
create index if not exists icebreakers_sender_idx
  on public.icebreakers (sender_id, created_at desc);

alter table public.icebreakers enable row level security;

-- Read: only the two people involved. NO insert/update/delete policies: clients can only write
-- through the SECURITY DEFINER functions below.
drop policy if exists "icebreakers_select_involved" on public.icebreakers;
create policy "icebreakers_select_involved" on public.icebreakers
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

revoke all on public.icebreakers from public, anon, authenticated;
grant select on public.icebreakers to authenticated;   -- row-filtered by the policy above

-- realtime (recipient inbox badge). Harmless if the publication already contains it.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'icebreakers') then
    alter publication supabase_realtime add table public.icebreakers;
  end if;
end $$;

-- ---------- limits (the ONE place to tune the quota) ---------------------------------
create or replace function public.icebreaker_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_default constant jsonb := jsonb_build_object(
    'free_total',    4,    -- free users: 4 first hellos in TOTAL (lifetime)
    'premium_daily', 10,   -- premium: 10 first hellos per rolling 24 hours
    'hourly',        10,   -- everyone: max sent per rolling hour
    'expire_days',   14,   -- pending icebreakers expire after this many days
    'max_len',       280
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

-- ---------- premium check: same rule as get_current_subscription_status, read-only ----
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

-- ---------- send ---------------------------------------------------------------------
create or replace function public.send_icebreaker(p_recipient uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me        uuid := auth.uid();
  v_lim       jsonb := public.icebreaker_limits();
  v_msg       text;
  v_premium   boolean;
  v_used      int;
  v_today     int;
  v_free      int := (v_lim->>'free_total')::int;
  v_id        uuid;
  v_match     uuid;
  v_expire    interval := make_interval(days => (v_lim->>'expire_days')::int);
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_recipient is null or p_recipient = v_me then
    return jsonb_build_object('ok', false, 'error', 'invalid_recipient');
  end if;

  -- sanitize: strip control chars and angle brackets (rendered as plain text by the app), trim
  v_msg := btrim(regexp_replace(coalesce(p_message, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F<>]', '', 'g'));
  if char_length(v_msg) < 1 or char_length(v_msg) > (v_lim->>'max_len')::int then
    return jsonb_build_object('ok', false, 'error', 'invalid_message');
  end if;

  -- both accounts must exist and be active
  if exists (select 1 from public.profiles p
             where p.id in (v_me, p_recipient) and coalesce(p.account_status, 'active') <> 'active')
     or (select count(*) from public.profiles p where p.id in (v_me, p_recipient)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  -- already matched -> the app should open the chat instead
  select m.id into v_match from public.matches m
  where (m.user1_id = v_me and m.user2_id = p_recipient) or (m.user1_id = p_recipient and m.user2_id = v_me)
  limit 1;
  if v_match is not null then
    return jsonb_build_object('ok', false, 'error', 'already_matched', 'match_id', v_match);
  end if;

  v_premium := public.icebreaker_is_premium(v_me);
  select count(*) into v_used from public.icebreakers where sender_id = v_me;
  select count(*) into v_today from public.icebreakers where sender_id = v_me and created_at > now() - interval '1 day';

  -- blocked either way, or the recipient already declined this sender: report success but store nothing
  -- and spend no quota ("shadow" success: never reveals a block/decline, protects the recipient).
  if exists (select 1 from public.blocks b
             where (b.blocker_id = p_recipient and b.blocked_id = v_me) or (b.blocker_id = v_me and b.blocked_id = p_recipient))
     or exists (select 1 from public.icebreakers i
                where i.sender_id = v_me and i.recipient_id = p_recipient and i.status = 'declined') then
    return jsonb_build_object('ok', true, 'silent', true,
      'remaining', case when v_premium then greatest((v_lim->>'premium_daily')::int - v_today, 0) else greatest(v_free - v_used, 0) end,
      'is_premium', v_premium);
  end if;

  -- one open icebreaker per person (expired ones don't count)
  if exists (select 1 from public.icebreakers i
             where i.sender_id = v_me and i.recipient_id = p_recipient and i.status = 'pending'
               and i.created_at > now() - v_expire) then
    return jsonb_build_object('ok', false, 'error', 'already_sent');
  end if;
  -- turn an overdue pending one into 'expired' so a fresh one can be sent
  update public.icebreakers set status = 'expired', responded_at = now()
   where sender_id = v_me and recipient_id = p_recipient and status = 'pending' and created_at <= now() - v_expire;

  -- quotas
  if not v_premium and v_used >= v_free then
    return jsonb_build_object('ok', false, 'error', 'quota_exhausted', 'remaining', 0, 'is_premium', false);
  end if;
  if v_premium and v_today >= (v_lim->>'premium_daily')::int then
    return jsonb_build_object('ok', false, 'error', 'daily_limit', 'remaining', 0, 'is_premium', true);
  end if;
  if (select count(*) from public.icebreakers where sender_id = v_me and created_at > now() - interval '1 hour')
     >= (v_lim->>'hourly')::int then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  begin
    insert into public.icebreakers (sender_id, recipient_id, message)
    values (v_me, p_recipient, v_msg)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_sent');
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'is_premium', v_premium,
    'remaining', case when v_premium then greatest((v_lim->>'premium_daily')::int - (v_today + 1), 0) else greatest(v_free - (v_used + 1), 0) end);
end;
$$;

-- ---------- respond ------------------------------------------------------------------
create or replace function public.respond_icebreaker(p_id uuid, p_accept boolean, p_block boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_lim    jsonb := public.icebreaker_limits();
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

  -- idempotent
  if r.status = 'accepted' then
    return jsonb_build_object('ok', true, 'status', 'accepted', 'match_id', r.match_id);
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'status', r.status);
  end if;
  if r.created_at <= now() - make_interval(days => (v_lim->>'expire_days')::int) then
    update public.icebreakers set status = 'expired', responded_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- DECLINE (silent for the sender)
  if not coalesce(p_accept, false) then
    update public.icebreakers set status = 'declined', responded_at = now() where id = r.id;
    if coalesce(p_block, false) then
      insert into public.blocks (blocker_id, blocked_id, reason)
      values (v_me, r.sender_id, 'icebreaker')
      on conflict (blocker_id, blocked_id) do nothing;
    end if;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- ACCEPT: refuse if either side blocked the other since it was sent
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
    -- The "someone liked you" push is skipped for this transaction (see notify_like_received guard below);
    -- the sender still gets the normal "It's a match" push from notify_match_created.
    perform set_config('app.icebreaker_accept', '1', true);
    -- sender's like first, accepter's like last: notify_match_created pushes to everyone EXCEPT the latest liker.
    -- Explicit, distinct timestamps (now() is identical for every statement of a transaction, which would
    -- make "latest liker" a coin flip).
    insert into public.likes (liker_id, liked_id, created_at)
    values (r.sender_id, v_me, clock_timestamp() - interval '2 seconds') on conflict do nothing;
    insert into public.likes (liker_id, liked_id, created_at)
    values (v_me, r.sender_id, clock_timestamp()) on conflict do nothing;
    perform set_config('app.icebreaker_accept', '', true);

    select m.id into v_match from public.matches m where m.user1_id = v_u1 and m.user2_id = v_u2 limit 1;
    if v_match is null then   -- mutual-like trigger missing/disabled: create it the way like_and_usage_batched does
      insert into public.matches (user1_id, user2_id, user1_unread_count, user2_unread_count)
      values (v_u1, v_u2, 0, 0)
      on conflict (user1_id, user2_id) do nothing
      returning id into v_match;
      if v_match is null then
        select m.id into v_match from public.matches m where m.user1_id = v_u1 and m.user2_id = v_u2 limit 1;
      end if;
    end if;
  end if;

  -- the icebreaker text becomes the FIRST chat message, from the sender; already read by the accepter
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

-- ---------- inbox --------------------------------------------------------------------
-- Only fields that are already public in Discover: first name, age, city, verified, main photo.
create or replace function public.get_icebreaker_inbox()
returns table (
  id uuid, sender_id uuid, message text, created_at timestamptz,
  first_name text, age int, city text, is_verified boolean, photo_url text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.sender_id, i.message, i.created_at,
         initcap(btrim(p.first_name)),
         case when p.date_of_birth is null then null else date_part('year', age(p.date_of_birth))::int end,
         p.city,
         coalesce(p.is_verified, false),
         (select u.image_url from public.user_images u
           where u.user_id = p.id and coalesce(u.is_approved, true) and coalesce(u.moderation_status, 'approved') <> 'rejected'
           order by u.image_order nulls last, u.created_at limit 1)
  from public.icebreakers i
  join public.profiles p on p.id = i.sender_id
  where i.recipient_id = auth.uid()
    and i.status = 'pending'
    and i.created_at > now() - make_interval(days => (public.icebreaker_limits()->>'expire_days')::int)
    and coalesce(p.account_status, 'active') = 'active'
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = auth.uid() and b.blocked_id = i.sender_id)
                       or (b.blocker_id = i.sender_id and b.blocked_id = auth.uid()))
  order by i.created_at desc
  limit 50;
$$;

-- ---------- quota & per-person status -------------------------------------------------
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
  v_used    int;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_premium := public.icebreaker_is_premium(v_me);
  -- free: lifetime total; premium: the last 24 hours
  if v_premium then
    select count(*) into v_used from public.icebreakers where sender_id = v_me and created_at > now() - interval '1 day';
  else
    select count(*) into v_used from public.icebreakers where sender_id = v_me;
  end if;
  return jsonb_build_object(
    'ok', true,
    'is_premium', v_premium,
    'limit', case when v_premium then (v_lim->>'premium_daily')::int else (v_lim->>'free_total')::int end,
    'used', v_used,
    'remaining', greatest(case when v_premium then (v_lim->>'premium_daily')::int else (v_lim->>'free_total')::int end - v_used, 0));
end;
$$;

-- is there already a match / an open icebreaker between me and this person?
create or replace function public.get_icebreaker_status(p_other uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := auth.uid();
  v_match uuid;
  v_pend  boolean;
begin
  if v_me is null or p_other is null then
    return jsonb_build_object('ok', false);
  end if;
  select m.id into v_match from public.matches m
  where (m.user1_id = v_me and m.user2_id = p_other) or (m.user1_id = p_other and m.user2_id = v_me) limit 1;
  select exists (select 1 from public.icebreakers i
                 where i.sender_id = v_me and i.recipient_id = p_other and i.status = 'pending'
                   and i.created_at > now() - make_interval(days => (public.icebreaker_limits()->>'expire_days')::int))
    into v_pend;
  -- 'pending' also stays true for a declined/blocked pair is NOT possible by design: those return silent success on send.
  return jsonb_build_object('ok', true, 'matched', v_match is not null, 'match_id', v_match, 'pending', v_pend);
end;
$$;

-- cron-friendly housekeeping (optional): select public.expire_icebreakers();
create or replace function public.expire_icebreakers()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  update public.icebreakers set status = 'expired', responded_at = now()
   where status = 'pending' and created_at <= now() - make_interval(days => (public.icebreaker_limits()->>'expire_days')::int);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------- notification: same pattern as notify_like_received / notify_match_created --
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
      'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
    ),
    body := jsonb_build_object(
      'title', coalesce(nullif(v_name, ''), 'Someone') || ' broke the ice 💬',
      'body', 'Open to read their message - accept to start chatting',
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

-- ---------- notify_like_received: SAME body as live + a guard so accepting an icebreaker does not
-- send the accepter a "Someone liked you" push for the like we insert on their behalf. -------------
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
      'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
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

-- ---------- privileges: authenticated only -------------------------------------------
revoke all on function public.icebreaker_limits()                  from public, anon, authenticated;
revoke all on function public.icebreaker_is_premium(uuid)          from public, anon, authenticated;
revoke all on function public.expire_icebreakers()                 from public, anon, authenticated;
revoke all on function public.notify_icebreaker_received()         from public, anon, authenticated;
revoke all on function public.send_icebreaker(uuid, text)          from public, anon;
revoke all on function public.respond_icebreaker(uuid, boolean, boolean) from public, anon;
revoke all on function public.get_icebreaker_inbox()               from public, anon;
revoke all on function public.get_icebreaker_quota()               from public, anon;
revoke all on function public.get_icebreaker_status(uuid)          from public, anon;
grant execute on function public.send_icebreaker(uuid, text)                to authenticated;
grant execute on function public.respond_icebreaker(uuid, boolean, boolean) to authenticated;
grant execute on function public.get_icebreaker_inbox()                     to authenticated;
grant execute on function public.get_icebreaker_quota()                     to authenticated;
grant execute on function public.get_icebreaker_status(uuid)                to authenticated;
grant execute on function public.icebreaker_limits(), public.icebreaker_is_premium(uuid), public.expire_icebreakers() to service_role;

-- ---------- VERIFICATION (run after applying, as an authenticated user via the app or SQL editor) ----
-- select public.icebreaker_limits();
-- select has_function_privilege('anon', 'public.send_icebreaker(uuid,text)', 'EXECUTE');   -- expect false
-- select relrowsecurity from pg_class where oid = 'public.icebreakers'::regclass;             -- expect true
-- select policyname, cmd from pg_policies where tablename = 'icebreakers';                    -- expect 1 SELECT policy
-- select * from public.get_icebreaker_quota();                                                -- as a user
