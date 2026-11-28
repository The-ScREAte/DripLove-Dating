-- =====================================================================================
-- "Break the ice": the person who receives a hello is told right away that someone wrote to them and has 24 hours to
-- answer (one push, opens that chat), plus ONE reminder when only 3 hours are left. Same push path as the other
-- server pushes (send-push-notification with x-cron-secret + bearer), so users' notification settings apply.
-- =====================================================================================
alter table public.icebreakers add column if not exists reminded_at timestamptz;

create or replace function public.icebreaker_push(p_user uuid, p_sender uuid, p_match uuid, p_title text, p_body text, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'),
      'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
    ),
    body := jsonb_build_object(
      'title', p_title,
      'body', p_body,
      'userId', p_user,
      'type', 'message',
      'category', 'event',
      'kind', 'icebreaker',
      'dedupeKey', p_dedupe,
      'data', jsonb_build_object('chatId', p_match, 'senderId', p_sender)
    )
  );
exception when others then
  raise warning 'icebreaker_push failed: %', sqlerrm;
end;
$$;
revoke all on function public.icebreaker_push(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

-- the hello itself: "Ama sent you a message", reply within 24 hours
create or replace function public.notify_icebreaker_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_preview text;
begin
  select initcap(btrim(p.first_name)) into v_name from public.profiles p where p.id = new.sender_id;
  v_preview := case when char_length(new.message) > 70 then left(new.message, 70) || '…' else new.message end;
  perform public.icebreaker_push(new.recipient_id, new.sender_id, new.match_id,
    coalesce(nullif(v_name, ''), 'Someone') || ' sent you a message',
    '"' || v_preview || '" · Reply within 24 hours',
    'icebreaker:' || new.sender_id);
  return new;
exception when others then
  raise warning 'notify_icebreaker_received failed: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.notify_icebreaker_received() from public, anon, authenticated;
drop trigger if exists trg_notify_icebreaker_received on public.icebreakers;
create trigger trg_notify_icebreaker_received
  after insert on public.icebreakers
  for each row when (new.match_id is not null)
  execute function public.notify_icebreaker_received();

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

  -- a nudge when only 3 hours are left (once per hello)
  for r in
    update public.icebreakers set reminded_at = now()
     where status = 'pending' and reminded_at is null and expires_at > now() and expires_at <= now() + interval '3 hours'
    returning sender_id, recipient_id, match_id
  loop
    perform public.icebreaker_push(r.recipient_id, r.sender_id, r.match_id,
      '3 hours left to reply to ' || coalesce((select initcap(btrim(p.first_name)) from public.profiles p where p.id = r.sender_id), 'your match'),
      'Their message is waiting in your chats', 'icebreaker-reminder:' || r.match_id);
  end loop;
  return v_n;
end;
$$;
