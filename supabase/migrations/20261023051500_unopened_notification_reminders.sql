-- Reminders for unopened match / like / message pushes
--
-- Snapchat-style: when someone gets a match, a like ("interest") or a message
-- and doesn't open it, the same push is repeated every 2 hours until they do.
-- Only these three - pushes triggered by another person's action. Nothing
-- automatic (recommendations, streaks, broadcasts) is ever repeated.
--
-- A reminder stops as soon as the thing has been seen:
--   any kind  - the push (or a reminder of it) was tapped (opened_at)
--   message   - the chat has no unread messages for this person
--   match     - a message has been sent in the match, or they opened the app
--   like      - they opened the app (the Liked tab shows it)
-- Limits: at most 3 reminders per push, at most one reminder per person every
-- 2 hours (several unseen items = one reminder, the newest), never at night
-- (10pm-8am their time), and only for pushes that actually reached a phone.
-- Only notifications created after this migration are reminded about, so
-- going live doesn't repeat yesterday's backlog to everyone at once.

alter table public.notifications
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminded_at timestamptz;

create index if not exists notifications_reminder_candidates_idx
  on public.notifications (created_at)
  where kind in ('match', 'like', 'message') and opened_at is null;

create or replace function public.send_notification_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_live_since constant timestamptz := '2026-10-23 05:15:00+00';
  v_max_reminders constant integer := 3;
  v_every constant interval := interval '2 hours';
  v_sent integer := 0;
  v_rows jsonb;
  r record;
begin
  -- Claim first, send after: a FOR loop can't run over a query that also
  -- updates rows.
  with due as (
      select n.id, n.user_id, n.kind, n.type, n.title, n.message, n.data, n.created_at
      from public.notifications n
      where n.kind in ('match', 'like', 'message')
        and n.category = 'event'
        and n.opened_at is null
        and n.created_at >= v_live_since
        and n.created_at > now() - interval '24 hours'
        and n.reminder_count < v_max_reminders
        and coalesce(n.last_reminded_at, n.created_at) <= now() - v_every
        -- The original push reached a phone (no device / notifications off
        -- is already handled by the missed-notification email).
        and exists (
          select 1 from public.push_delivery_log l
          where l.notification_id = n.id and l.decision = 'sent')
        -- Not seen yet.
        and case n.kind
          when 'message' then exists (
            select 1 from public.matches m
            where m.id::text = n.data->>'chatId'
              and case when m.user1_id = n.user_id then coalesce(m.user1_unread_count, 0)
                       else coalesce(m.user2_unread_count, 0) end > 0)
          when 'match' then
            coalesce(public.user_last_active_at(n.user_id), '-infinity'::timestamptz) < n.created_at
            and not exists (
              select 1 from public.matches m
              where m.id::text = n.data->>'matchId' and m.first_message_at is not null)
            -- A match that has since expired/been removed isn't reminded.
            and exists (select 1 from public.matches m where m.id::text = n.data->>'matchId')
          else
            coalesce(public.user_last_active_at(n.user_id), '-infinity'::timestamptz) < n.created_at
        end
      for update of n skip locked
    ),
    -- Nobody gets two reminders in one go: the newest unseen item per person.
    -- Their other due items count as reminded too, so they don't follow
    -- minutes later.
    picked as (
      select distinct on (d.user_id) d.*
      from due d
      order by d.user_id, d.created_at desc
    ),
    eligible as (
      select p.*
      from picked p
      cross join lateral public.push_eligibility(p.user_id, 'event', p.kind, null) e
      where e.allowed and e.local_hour between 8 and 21
    ),
    marked as (
      update public.notifications n
         set reminder_count = n.reminder_count + 1, last_reminded_at = now()
       where n.id in (select d.id from due d where d.user_id in (select user_id from eligible))
      returning n.id
    )
  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_rows from eligible e;

  for r in
    select * from jsonb_to_recordset(v_rows)
      as x(id uuid, user_id uuid, kind text, type text, title text, message text, data jsonb)
  loop
    perform net.http_post(
      url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select s.value from public.internal_secrets s where s.key = 'notification_cron_anon_key')
      ),
      body := jsonb_build_object(
        'title', r.title,
        'body', coalesce(r.message, ''),
        'userId', r.user_id,
        'type', r.type,
        'category', 'event',
        'kind', r.kind,
        'dedupeKey', 'reminder:' || r.id || ':' || extract(epoch from now())::bigint,
        'data', (coalesce(r.data, '{}'::jsonb) - 'notificationId')
                || jsonb_build_object('catchup', 'true', 'reminderOf', r.id::text)
      )
    );
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$function$;

revoke all on function public.send_notification_reminders() from public, anon, authenticated;

select cron.schedule(
  'send-notification-reminders',
  '*/15 * * * *',
  'select public.send_notification_reminders();'
);
