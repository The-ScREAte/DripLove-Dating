-- One budget for every non-urgent push.
--
-- Automatic engagement pushes (recommendations, games, streaks,
-- re-engagement) and scheduled pushes used to be gated separately, so someone
-- could get two automatic pushes and a scheduled one on the same day, and
-- Tuesday/Thursday were never really quiet. marketing_push_gate() is now the
-- single rule both use (push_eligibility for 'engagement', and
-- claim_broadcast_recipients for scheduled pushes with smart quiet on):
--
--   * Tuesday and Thursday (their local day): none at all.
--   * Opened the app in the last 4 hours: none.
--   * A like, match or message in the last 4 hours: none - the real push
--     already said what matters.
--   * About two a day, at least 4 hours apart (morning + evening, or
--     afternoon + evening); only one on a day they've already used the app.
--   * Away a week or more: one a week at most.
--
-- Likes, matches, messages and other transactional pushes are never limited by it.

create or replace function public.marketing_push_gate(p_user_id uuid)
returns text -- null = OK to send a non-urgent push now; otherwise why not
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_tz text;
  v_local timestamp;
  v_day_start timestamptz;
  v_last_active timestamptz;
  v_sent_today integer;
  v_sent_week integer;
  v_last_sent timestamptz;
begin
  select public.user_timezone(p.timezone, p.country_code) into v_tz from public.profiles p where p.id = p_user_id;
  if not found then return 'no_profile'; end if;
  v_tz := coalesce(v_tz, 'UTC');
  v_local := now() at time zone v_tz;

  if extract(isodow from v_local) in (2, 4) then return 'quiet_day'; end if;

  v_last_active := public.user_last_active_at(p_user_id);
  if v_last_active > now() - interval '4 hours' then return 'recently_active'; end if;

  if exists (select 1 from public.push_delivery_log l
             where l.user_id = p_user_id and l.category = 'event' and l.decision = 'sent'
               and l.created_at > now() - interval '4 hours')
     or exists (select 1 from public.matches m
                where (m.user1_id = p_user_id or m.user2_id = p_user_id)
                  and m.created_at > now() - interval '4 hours')
     or exists (select 1 from public.chats c
                where c.recipient_id = p_user_id and c.created_at > now() - interval '4 hours') then
    return 'recent_event';
  end if;

  v_day_start := date_trunc('day', v_local) at time zone v_tz;
  select count(*) filter (where l.created_at >= v_day_start), count(*), max(l.created_at)
    into v_sent_today, v_sent_week, v_last_sent
  from public.push_delivery_log l
  where l.user_id = p_user_id and l.category in ('engagement', 'broadcast') and l.decision = 'sent'
    and l.created_at > now() - interval '7 days';

  if v_last_active is null or v_last_active < now() - interval '7 days' then
    return case when v_sent_week >= 1 then 'weekly_budget' end;
  end if;

  if v_sent_today >= (case when v_last_active >= v_day_start then 1 else 2 end) then return 'daily_budget'; end if;
  if v_last_sent > now() - interval '4 hours' then return 'too_soon'; end if;
  return null;
end;
$$;
revoke all on function public.marketing_push_gate(uuid) from public, anon, authenticated;

-- Same checks as before for devices, permissions, dedupe and tiers; the caps
-- now come from the shared budget.
create or replace function public.push_eligibility(p_user_id uuid, p_category text, p_kind text, p_dedupe_key text default null)
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

  if v_tier in ('inactive', 'dormant') then
    return query select false, 'inactive_no_engagement'::text, v_tier, v_hour; return; end if;
  if v_hour >= 22 or v_hour < 8 then
    return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;

  v_gate := public.marketing_push_gate(p_user_id);
  if v_gate is not null then
    return query select false, v_gate, v_tier, v_hour; return; end if;
  return query select true, ('engagement_' || v_tier)::text, v_tier, v_hour;
end;
$function$;

-- Scheduled pushes with smart quiet follow the same budget, decided at the
-- moment of sending.
create or replace function public.claim_broadcast_recipients(p_campaign_id uuid, p_batch_size integer, p_max_retries integer)
returns table(id uuid, user_id uuid, retry_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quiet boolean;
  v_rows integer;
begin
  select coalesce(s.smart_quiet, false) into v_quiet
  from public.broadcast_campaigns c
  left join public.scheduled_broadcasts s on s.id = c.scheduled_broadcast_id
  where c.id = p_campaign_id;
  v_quiet := coalesce(v_quiet, false);

  -- A batch can be entirely held back; keep going until something is sendable
  -- or nothing more is due, so the worker doesn't stop early.
  for i in 1..25 loop
    return query
    with to_claim as (
      select r.id, r.user_id from public.broadcast_recipients r
      where r.campaign_id = p_campaign_id
        and r.status = 'pending'
        and coalesce(r.retry_count, 0) < p_max_retries
        and (r.next_attempt_at is null or r.next_attempt_at <= now())
      -- Earliest due first; within the same minute, random (ids are random
      -- UUIDs, new for every send).
      order by date_trunc('minute', coalesce(r.next_attempt_at, r.created_at)), r.id
      limit p_batch_size
      for update skip locked
    ),
    judged as (
      select tc.id, case when v_quiet then public.marketing_push_gate(tc.user_id) end as held
      from to_claim tc
    ),
    upd as (
      update public.broadcast_recipients r
         set status = case when j.held is not null then 'suppressed' else 'processing' end,
             processing_started_at = case when j.held is not null then null else now() end,
             error_message = case when j.held is not null then 'Held back: ' || j.held else r.error_message end
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
