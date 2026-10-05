-- Likes and matches: everyone hears about them, on the channel that works.
--
--   Phone can show notifications -> push
--     * likes now reach every activity level (before: only people active in
--       the last 7 days). Daytime in their own time zone, grouped
--       ("3 people liked you"), at most one like push per 3 hours; people not
--       active this week get at most 2 like pushes a day.
--     * matches and messages: straight away, as before.
--   Notifications blocked or app deleted -> no pushes at all. The one
--     exception is an email about likes and matches: at most 2 a day,
--     6+ hours apart, 9am-9pm their time, never to unsubscribed or bounced
--     addresses.
--
-- Anything that can't go out immediately (night-time, grouping, daily cap,
-- no device, notifications off, push failed) lands in notification_email_queue
-- - now the "missed likes & matches" queue. Every 15 minutes
-- process-missed-notifications sends what is due on the right channel. If the
-- person opens the app first, the items are marked seen and nothing is sent.

-- 1. Queue status ---------------------------------------------------------------

alter table public.notification_email_queue
  add column if not exists status text not null default 'pending',
  add column if not exists channel text,
  add column if not exists handled_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notification_email_queue_status_check') then
    alter table public.notification_email_queue add constraint notification_email_queue_status_check
      check (status in ('pending', 'claimed', 'pushed', 'emailed', 'seen', 'expired', 'dropped'));
  end if;
end $$;

create index if not exists notification_email_queue_status_idx
  on public.notification_email_queue (status, user_id, created_at);

-- 2. "Did they open the app after this happened?" --------------------------------
-- Real opens only (user_last_active_at also counts streak days, which would
-- hide likes that arrived after a streak check-in).

create or replace function public.user_last_open_at(p_user_id uuid)
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(
    p.last_app_open_at,
    p.last_login_at,
    (select max(coalesce(t.last_seen_at, t.updated_at)) from public.push_tokens t where t.user_id = p.id)
  )
  from public.profiles p where p.id = p_user_id;
$$;
revoke all on function public.user_last_open_at(uuid) from public, anon, authenticated;

-- 3. Like pushes for everyone (grouped, daytime, capped for the less active) -----

create or replace function public.push_eligibility(p_user_id uuid, p_category text, p_kind text, p_dedupe_key text default null)
returns table (allowed boolean, reason text, tier text, local_hour integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text; v_permission text; v_tz text; v_country text; v_last timestamptz; v_tier text; v_hour integer;
  v_cat text := lower(coalesce(nullif(p_category, ''), 'engagement'));
  v_kind text := lower(coalesce(nullif(p_kind, ''), 'system'));
  v_quiet boolean; v_count integer; v_last_sent timestamptz;
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
  v_quiet := v_hour >= 22 or v_hour < 8;

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

  if v_cat = 'transactional' then
    return query select true, 'transactional'::text, v_tier, v_hour; return; end if;

  -- Admin broadcasts: every activity level, daytime only, max 2 per 24h.
  if v_cat = 'broadcast' then
    if v_quiet then
      return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
    select count(*) into v_count from public.push_delivery_log l
    where l.user_id = p_user_id and l.category = 'broadcast' and l.decision = 'sent'
      and l.created_at > now() - interval '24 hours';
    if v_count >= 2 then
      return query select false, 'broadcast_cap'::text, v_tier, v_hour; return; end if;
    return query select true, 'broadcast'::text, v_tier, v_hour; return;
  end if;

  if v_cat = 'event' then
    if v_kind = 'like' then
      if v_quiet then
        return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
      select max(l.created_at), count(*) filter (where l.created_at > now() - interval '24 hours')
        into v_last_sent, v_count
        from public.push_delivery_log l
       where l.user_id = p_user_id and l.kind = 'like' and l.decision = 'sent';
      if v_last_sent > now() - interval '3 hours' then
        return query select false, 'like_grouped'::text, v_tier, v_hour; return; end if;
      if v_tier <> 'active' and v_count >= 2 then
        return query select false, 'like_cap'::text, v_tier, v_hour; return; end if;
    end if;
    return query select true, 'event'::text, v_tier, v_hour; return;
  end if;

  if v_tier in ('inactive', 'dormant') then
    return query select false, 'inactive_no_engagement'::text, v_tier, v_hour; return; end if;
  if v_quiet then
    return query select false, 'quiet_hours'::text, v_tier, v_hour; return; end if;
  if v_tier = 'lapsed' then
    if exists (select 1 from public.push_delivery_log l
      where l.user_id = p_user_id and l.category = 'engagement' and l.decision = 'sent'
        and l.created_at > now() - interval '7 days') then
      return query select false, 'lapsed_weekly_cap'::text, v_tier, v_hour; return; end if;
    return query select true, 'engagement_lapsed'::text, v_tier, v_hour; return;
  end if;
  select count(*), max(l.created_at) into v_count, v_last_sent from public.push_delivery_log l
  where l.user_id = p_user_id and l.category = 'engagement' and l.decision = 'sent'
    and l.created_at > now() - interval '24 hours';
  if v_count >= 2 then
    return query select false, 'daily_cap'::text, v_tier, v_hour; return; end if;
  if v_last_sent > now() - interval '4 hours' then
    return query select false, 'too_soon'::text, v_tier, v_hour; return; end if;
  return query select true, 'engagement_active'::text, v_tier, v_hour;
end;
$$;
revoke all on function public.push_eligibility(uuid, text, text, text) from public, anon, authenticated;

-- 4. Which channel can reach this person? -----------------------------------------

create or replace function public.missed_notification_route(p_user_id uuid)
returns table (route text, reason text, local_hour integer, email text, first_name text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text; v_permission text; v_tz text; v_country text; v_email text; v_name text;
  v_hour integer; v_has_device boolean;
begin
  select p.account_status, p.notification_permission, p.timezone, p.country_code,
         lower(trim(p.email)), p.first_name
    into v_status, v_permission, v_tz, v_country, v_email, v_name
  from public.profiles p where p.id = p_user_id;
  if not found then
    return query select 'none'::text, 'no_profile'::text, null::integer, null::text, null::text; return;
  end if;

  begin
    v_hour := extract(hour from (now() at time zone public.user_timezone(v_tz, v_country)))::integer;
  exception when others then
    v_hour := extract(hour from (now() at time zone 'UTC'))::integer;
  end;

  if coalesce(v_status, 'active') <> 'active' then
    return query select 'none'::text, 'account_not_active'::text, v_hour, null::text, null::text; return;
  end if;

  v_has_device := exists (select 1 from public.push_tokens t where t.user_id = p_user_id);
  if v_has_device and coalesce(v_permission, '') <> 'denied' then
    return query select 'push'::text, 'reachable'::text, v_hour, v_email, v_name; return;
  end if;

  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return query select 'none'::text, 'no_email'::text, v_hour, null::text, v_name; return;
  end if;
  if exists (select 1 from public.email_suppression_list s where s.email = v_email and s.released_at is null) then
    return query select 'none'::text, 'email_blocked'::text, v_hour, v_email, v_name; return;
  end if;
  return query select 'email'::text,
    case when v_has_device then 'notifications_off' else 'no_device' end,
    v_hour, v_email, v_name;
end;
$$;
revoke all on function public.missed_notification_route(uuid) from public, anon, authenticated;

-- 5. Hand out what's due (one row per person) ------------------------------------
-- p_email_budget: how many emails the sending accounts can still take today.
-- p_dry_run: decide only, change nothing (used for testing).
-- p_only_users: limit the run to these people (testing on test accounts).

create or replace function public.claim_missed_notifications(
  p_max_users integer default 200,
  p_email_budget integer default 0,
  p_dry_run boolean default false,
  p_only_users uuid[] default null
)
returns table (
  user_id uuid, route text, reason text, local_hour integer, email text, first_name text,
  like_count integer, match_count integer, match_sender_ids text[], item_ids bigint[]
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r record;
  v_route record;
  v_elig record;
  v_returned integer := 0;
  v_emails integer := 0;
  v_recent integer;
  v_last_email timestamptz;
begin
  if not p_dry_run then
    -- A run that died part-way: put its items back.
    update public.notification_email_queue q set status = 'pending'
     where q.status = 'claimed' and q.handled_at < now() - interval '30 minutes'
       and (p_only_users is null or q.user_id = any (p_only_users));
    -- Too old to be worth announcing.
    update public.notification_email_queue q set status = 'expired', handled_at = now()
     where q.status = 'pending'
       and q.created_at < now() - case when q.kind = 'match' then interval '72 hours' else interval '48 hours' end
       and (p_only_users is null or q.user_id = any (p_only_users));
    -- They opened the app after it happened - they've seen it.
    update public.notification_email_queue q set status = 'seen', handled_at = now()
     where q.status = 'pending'
       and (p_only_users is null or q.user_id = any (p_only_users))
       and public.user_last_open_at(q.user_id) > q.created_at;
  end if;

  for r in
    select q.user_id as uid,
           (count(*) filter (where q.kind = 'like'))::integer as likes,
           (count(*) filter (where q.kind = 'match'))::integer as matches,
           coalesce(array_agg(q.data->>'senderId') filter (
             where q.kind = 'match' and coalesce(q.data->>'senderId', '') <> ''), '{}'::text[]) as match_senders,
           array_agg(q.id) as ids
    from public.notification_email_queue q
    where q.status = 'pending'
      and (p_only_users is null or q.user_id = any (p_only_users))
      and q.created_at > now() - case when q.kind = 'match' then interval '72 hours' else interval '48 hours' end
      and not coalesce(public.user_last_open_at(q.user_id) > q.created_at, false)
    group by q.user_id
    order by count(*) filter (where q.kind = 'match') desc, max(q.created_at) desc
  loop
    exit when v_returned >= p_max_users;

    select * into v_route from public.missed_notification_route(r.uid);

    if v_route.route = 'none' then
      if not p_dry_run then
        update public.notification_email_queue q
           set status = 'dropped', channel = v_route.reason, handled_at = now()
         where q.id = any (r.ids);
      end if;
      continue;
    end if;

    if v_route.route = 'push' then
      if r.matches = 0 then
        -- Likes follow the like-push rules; night-time / grouped / capped
        -- items simply wait for a later run.
        select * into v_elig from public.push_eligibility(r.uid, 'event', 'like', null);
        if not coalesce(v_elig.allowed, false) then continue; end if;
      end if;
    else
      -- Email: daytime only, at most 2 a day, 6+ hours apart, within budget.
      if v_route.local_hour is null or v_route.local_hour < 9 or v_route.local_hour >= 21 then continue; end if;
      select count(*), max(e.created_at) into v_recent, v_last_email
        from public.email_send_queue e
       where e.user_id = r.uid and e.kind = 'notification'
         and e.created_at > now() - interval '24 hours' and e.status <> 'failed';
      if v_recent >= 2 or v_last_email > now() - interval '6 hours' then continue; end if;
      if v_emails >= p_email_budget then continue; end if;
      v_emails := v_emails + 1;
    end if;

    if not p_dry_run then
      update public.notification_email_queue q
         set status = 'claimed', channel = v_route.route, handled_at = now()
       where q.id = any (r.ids);
    end if;
    v_returned := v_returned + 1;
    return query select r.uid, v_route.route, v_route.reason, v_route.local_hour, v_route.email,
                        v_route.first_name, r.likes, r.matches, r.match_senders, r.ids;
  end loop;
end;
$$;
revoke all on function public.claim_missed_notifications(integer, integer, boolean, uuid[]) from public, anon, authenticated;

-- 6. Every 15 minutes, only when something is waiting ------------------------------

select cron.unschedule('process-missed-notifications')
where exists (select 1 from cron.job where jobname = 'process-missed-notifications');
select cron.schedule(
  'process-missed-notifications',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/process-missed-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.notification_email_queue where status = 'pending');
  $cron$
);
