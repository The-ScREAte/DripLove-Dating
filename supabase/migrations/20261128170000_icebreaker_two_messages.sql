-- =====================================================================================
-- "Break the ice" chats: until the other person replies, the sender can send at most 2 messages in that chat (the
-- hello itself + 1 more). Enforced here so every app version follows it; the app shows a calm "wait for a reply".
-- Only applies while the hello's 24h clock is running (status 'pending'); a reply, or a normal match, is unaffected.
-- =====================================================================================
create or replace function public.icebreaker_limit_unanswered()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.icebreakers i
             where i.match_id = new.match_id and i.status = 'pending' and i.expires_at > now()
               and i.sender_id = new.sender_id)
     and (select count(*) from public.chats c where c.match_id = new.match_id and c.sender_id = new.sender_id) >= 2 then
    raise exception 'icebreaker_wait_for_reply' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.icebreaker_limit_unanswered() from public, anon, authenticated;
drop trigger if exists trg_icebreaker_limit_unanswered on public.chats;
create trigger trg_icebreaker_limit_unanswered
  before insert on public.chats
  for each row execute function public.icebreaker_limit_unanswered();
