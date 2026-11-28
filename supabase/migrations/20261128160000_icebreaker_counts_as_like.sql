-- =====================================================================================
-- "Break the ice": sending a hello also counts as a LIKE (owner, 2026-11-28).
--   * send_icebreaker inserts likes(sender -> recipient) (no extra "someone liked you" push - the hello message
--     already notifies them). If they had already liked the sender this completes a real mutual match.
--   * If the 24 hours pass without a reply, the like that the hello created is removed together with the chat, so the
--     person really goes back into the sender's Discover queue (liked people are otherwise hidden from it). A real
--     mutual match (they had liked the sender too) is never removed by the timer.
-- Builds on 20261128150000_icebreakers_as_chats.sql.
-- =====================================================================================

alter table public.icebreakers add column if not exists created_like boolean not null default false;

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
  v_liked    int := 0;
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

  -- a hello counts as a LIKE (shows in their Liked Me, can complete a mutual match). No separate "someone liked you"
  -- push: the hello message already notifies them.
  perform set_config('app.icebreaker_send', '1', true);
  insert into public.likes (liker_id, liked_id) values (v_me, p_recipient) on conflict do nothing;
  get diagnostics v_liked = row_count;
  perform set_config('app.icebreaker_send', '', true);
  update public.icebreakers set created_like = (v_liked > 0) where id = v_id;

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


-- ---------- notify_like_received: LIVE body + guards (accepting an old-style hello / sending a hello) ----------
create or replace function public.notify_like_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

-- ---------- expiry: remove the unanswered chat AND the like the hello created (never a real mutual match) ------
create or replace function public.expire_icebreakers()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int := 0;
  r   record;
begin
  perform set_config('app.icebreaker_expiring', '1', true);
  for r in
    update public.icebreakers set status = 'expired', responded_at = now()
     where status = 'pending' and expires_at <= now()
    returning id, sender_id, recipient_id, match_id, created_like
  loop
    v_n := v_n + 1;
    -- they liked the sender too: that is a real match, keep the conversation
    if exists (select 1 from public.likes l where l.liker_id = r.recipient_id and l.liked_id = r.sender_id) then
      continue;
    end if;
    if r.match_id is not null then
      delete from public.chats c where c.match_id = r.match_id;
      delete from public.matches m where m.id = r.match_id;
    end if;
    if r.created_like then
      delete from public.likes l where l.liker_id = r.sender_id and l.liked_id = r.recipient_id;
    end if;
  end loop;
  perform set_config('app.icebreaker_expiring', '', true);
  return v_n;
end;
$$;
