-- =====================================================================================
-- "Break the ice" becomes a NORMAL CHAT (owner, 2026-11-28: "the first message should be part of normal chats,
-- nothing different, no separate page").
--
-- Sending a hello now:
--   * creates the conversation (a row in public.matches) right away, with NO "It's a match" push,
--   * puts the hello into it as the first chat message (so it shows in the Chat list and the normal chat screen,
--     and the usual new-message notification goes to the other person),
--   * starts a 24 hour clock (icebreakers.expires_at). The other person answers simply by replying in the chat.
--   * If they have not replied when the 24 hours are up, the conversation is removed again and the person goes back
--     into the sender's Discover queue. If they unmatch/delete the chat first, that counts as "no" (declined).
-- Weekly allowance (10 per 7 days, renews, no carry-over) is unchanged.
-- Builds on 20261128120000_icebreakers_weekly_24h.sql.
-- =====================================================================================

alter table public.icebreakers add column if not exists match_id uuid references public.matches(id) on delete set null;
create index if not exists icebreakers_match_idx on public.icebreakers (match_id) where status = 'pending';

-- ---------- no "It's a match" push for a conversation opened by a hello (LIVE body + one guard) ----------
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
  if coalesce(current_setting('app.icebreaker_send', true), '') = '1' then
    return new;
  end if;

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
        'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'), 'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
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

-- The hello now arrives as a normal chat message (with the normal message notification), so the separate
-- "X broke the ice" push would be a duplicate.
drop trigger if exists trg_notify_icebreaker_received on public.icebreakers;

-- ---------- send: hello = conversation + first message + 24h clock ----------------------------------------
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
  v_u1       uuid;
  v_u2       uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_recipient is null or p_recipient = v_me then
    return jsonb_build_object('ok', false, 'error', 'invalid_recipient');
  end if;

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

  -- already talking (a real match, or a hello either way that opened the chat): open that chat instead
  select m.id into v_match from public.matches m
  where (m.user1_id = v_me and m.user2_id = p_recipient) or (m.user1_id = p_recipient and m.user2_id = v_me)
  limit 1;
  if v_match is not null then
    return jsonb_build_object('ok', false, 'error', 'already_matched', 'match_id', v_match);
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

  -- open the conversation (no "It's a match" push for this)
  v_u1 := least(v_me, p_recipient);
  v_u2 := greatest(v_me, p_recipient);
  perform set_config('app.icebreaker_send', '1', true);
  insert into public.matches (user1_id, user2_id, user1_unread_count, user2_unread_count)
  values (v_u1, v_u2, 0, 0)
  on conflict (user1_id, user2_id) do nothing
  returning id into v_match;
  perform set_config('app.icebreaker_send', '', true);
  if v_match is null then
    return jsonb_build_object('ok', false, 'error', 'already_matched',
      'match_id', (select m.id from public.matches m where m.user1_id = v_u1 and m.user2_id = v_u2 limit 1));
  end if;

  insert into public.icebreakers (sender_id, recipient_id, message, expires_at, match_id)
  values (v_me, p_recipient, v_msg, now() + make_interval(hours => (v_lim->>'expire_hours')::int), v_match)
  returning id, expires_at into v_id, v_expires;

  -- the hello itself: the first message of that chat (normal unread count + normal message notification)
  insert into public.chats (match_id, sender_id, recipient_id, message)
  values (v_match, v_me, p_recipient, v_msg);

  insert into public.icebreaker_quota as q (user_id, window_start, used)
  values (v_me, now(), 1)
  on conflict (user_id) do update
    set window_start = case when q.window_start + make_interval(days => v_days) <= now() then now() else q.window_start end,
        used         = case when q.window_start + make_interval(days => v_days) <= now() then 1 else q.used + 1 end
  returning q.window_start + make_interval(days => v_days) into v_resets;

  return jsonb_build_object('ok', true, 'id', v_id, 'match_id', v_match, 'is_premium', v_premium, 'expires_at', v_expires,
    'limit', v_cap, 'remaining', greatest(v_cap - (v_used + 1), 0), 'resets_at', v_resets);
end;
$$;

-- ---------- the other person replied in the chat -> the hello is answered (clock stops) -------------------
create or replace function public.icebreaker_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.icebreakers
     set status = 'accepted', responded_at = now()
   where match_id = new.match_id and status = 'pending' and recipient_id = new.sender_id;
  return new;
exception when others then
  raise warning 'icebreaker_on_reply failed: %', sqlerrm;
  return new;
end;
$$;
drop trigger if exists trg_icebreaker_on_reply on public.chats;
create trigger trg_icebreaker_on_reply
  after insert on public.chats
  for each row execute function public.icebreaker_on_reply();

-- ---------- the chat was removed before an answer (unmatch / delete chat) -> that is a "no" ----------------
create or replace function public.icebreaker_on_match_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.icebreaker_expiring', true), '') = '1' then
    return old;
  end if;
  update public.icebreakers set status = 'declined', responded_at = now()
   where match_id = old.id and status = 'pending';
  return old;
exception when others then
  raise warning 'icebreaker_on_match_delete failed: %', sqlerrm;
  return old;
end;
$$;
drop trigger if exists trg_icebreaker_on_match_delete on public.matches;
create trigger trg_icebreaker_on_match_delete
  before delete on public.matches
  for each row execute function public.icebreaker_on_match_delete();

-- ---------- 24 hours without a reply: remove the chat again, person goes back to the sender's queue ---------
create or replace function public.expire_icebreakers()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
  v_matches uuid[];
begin
  with due as (
    update public.icebreakers set status = 'expired', responded_at = now()
     where status = 'pending' and expires_at <= now()
    returning match_id
  )
  select array_agg(match_id) filter (where match_id is not null), count(*) into v_matches, v_n from due;

  if v_matches is not null then
    perform set_config('app.icebreaker_expiring', '1', true);
    -- only conversations nobody but the sender wrote in (a reply would have accepted the hello already)
    delete from public.chats c where c.match_id = any(v_matches);
    delete from public.matches m where m.id = any(v_matches);
    perform set_config('app.icebreaker_expiring', '', true);
  end if;
  return coalesce(v_n, 0);
end;
$$;

-- ---------- what the chat screen needs: is there a running 24h clock on this conversation? ----------------
create or replace function public.get_icebreaker_for_match(p_match uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object('pending', true, 'expires_at', i.expires_at, 'sender_id', i.sender_id, 'recipient_id', i.recipient_id)
    from public.icebreakers i
    where i.match_id = p_match and i.status = 'pending' and i.expires_at > now()
      and (i.sender_id = auth.uid() or i.recipient_id = auth.uid())
    limit 1
  ), jsonb_build_object('pending', false));
$$;

-- ---------- older app versions still call respond_icebreaker from their inbox: keep them consistent ---------
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
    perform public.expire_icebreakers();
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if not coalesce(p_accept, false) then
    update public.icebreakers set status = 'declined', responded_at = now() where id = r.id;
    if r.match_id is not null then
      delete from public.chats c where c.match_id = r.match_id;
      delete from public.matches m where m.id = r.match_id;
    end if;
    if coalesce(p_block, false) then
      insert into public.blocks (blocker_id, blocked_id, reason)
      values (v_me, r.sender_id, 'icebreaker')
      on conflict (blocker_id, blocked_id) do nothing;
    end if;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- hellos sent with this version already opened the chat: accepting just stops the clock
  if r.match_id is not null then
    update public.icebreakers set status = 'accepted', responded_at = now() where id = r.id;
    return jsonb_build_object('ok', true, 'status', 'accepted', 'match_id', r.match_id);
  end if;

  -- a hello from before this version (no chat yet): open it the old way
  if exists (select 1 from public.blocks b
             where (b.blocker_id = v_me and b.blocked_id = r.sender_id) or (b.blocker_id = r.sender_id and b.blocked_id = v_me)) then
    update public.icebreakers set status = 'declined', responded_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  v_u1 := least(v_me, r.sender_id);
  v_u2 := greatest(v_me, r.sender_id);
  select m.id into v_match from public.matches m where m.user1_id = v_u1 and m.user2_id = v_u2 limit 1;
  if v_match is null then
    perform set_config('app.icebreaker_send', '1', true);
    insert into public.matches (user1_id, user2_id, user1_unread_count, user2_unread_count)
    values (v_u1, v_u2, 0, 0) on conflict (user1_id, user2_id) do nothing returning id into v_match;
    perform set_config('app.icebreaker_send', '', true);
    if v_match is null then
      select m.id into v_match from public.matches m where m.user1_id = v_u1 and m.user2_id = v_u2 limit 1;
    end if;
  end if;
  insert into public.chats (match_id, sender_id, recipient_id, message, is_read)
  values (v_match, r.sender_id, v_me, r.message, true);
  update public.icebreakers set status = 'accepted', responded_at = now(), match_id = v_match where id = r.id;
  return jsonb_build_object('ok', true, 'status', 'accepted', 'match_id', v_match);
end;
$$;

revoke all on function public.icebreaker_on_reply()            from public, anon, authenticated;
revoke all on function public.icebreaker_on_match_delete()     from public, anon, authenticated;
revoke all on function public.get_icebreaker_for_match(uuid)   from public, anon;
grant execute on function public.get_icebreaker_for_match(uuid) to authenticated;
