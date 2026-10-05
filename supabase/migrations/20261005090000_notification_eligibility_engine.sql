-- Notification eligibility engine
--
-- Every push already goes through the send-push-notification edge function.
-- This migration gives that function one rule set to ask before sending:
-- "should THIS person get THIS kind of push right now?" - based on when they
-- last actually opened the app, whether they can receive pushes at all,
-- their local time, and how many engagement pushes they've had recently.
--
-- Categories:
--   transactional - welcome, photo moderation, account notices: always sent
--                   (if the person has a device that can receive pushes)
--   event         - a real person did something: message, match, like.
--                   Messages and matches always go out; likes are grouped
--                   (max one push every 3h) and only pushed to recently
--                   active people, during their daytime.
--   engagement    - recommendations, comeback nudges, games, streaks,
--                   admin broadcasts. Active (opened in last 7 days): max 2
--                   per 24h, 4h apart, 8am-10pm local. Lapsed (8-30 days):
--                   max 1 per 7 days. Inactive 31+ days: no push.
--
-- Event notifications that can't be pushed (no device, notifications off,
-- inactive person) are recorded in notification_email_queue, ready for an
-- email digest once a proper email provider is set up. Nothing sends from
-- that queue yet.

-- 1. Activity, local time and permission tracking --------------------------

alter table public.profiles
  add column if not exists last_app_open_at timestamptz,
  add column if not exists timezone text,
  add column if not exists notification_permission text,
  add column if not exists notification_permission_updated_at timestamptz;

alter table public.push_tokens
  add column if not exists last_seen_at timestamptz;

alter table public.notifications
  add column if not exists opened_at timestamptz,
  add column if not exists category text,
  add column if not exists kind text;

-- 2. Delivery log: one row per push decision (sent, suppressed, failed) -----

create table if not exists public.push_delivery_log (
  id bigserial primary key,
  user_id uuid not null,
  notification_id uuid,
  category text not null,
  kind text not null,
  decision text not null,            -- sent | suppressed | failed
  reason text,
  tier text,                          -- active | lapsed | inactive | dormant
  dedupe_key text,
  tokens_attempted integer not null default 0,
  tokens_ok integer not null default 0,
  tokens_removed integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists push_delivery_log_user_created_idx on public.push_delivery_log (user_id, created_at desc);
create index if not exists push_delivery_log_created_idx on public.push_delivery_log (created_at desc);
create index if not exists push_delivery_log_dedupe_idx on public.push_delivery_log (user_id, dedupe_key, created_at desc) where dedupe_key is not null;
alter table public.push_delivery_log enable row level security;
-- No policies: only the service role (edge functions) and SQL can read/write.

-- 3. Email holding queue (not sent from yet) --------------------------------

create table if not exists public.notification_email_queue (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_email_queue_pending_idx on public.notification_email_queue (user_id, created_at) where sent_at is null;
alter table public.notification_email_queue enable row level security;

-- 4. Helpers -----------------------------------------------------------------

-- Best available "last actually used the app" time. last_app_open_at is the
-- real signal (reported by the app on every open/resume); until every user
-- is on an app version that reports it, the device token's last refresh
-- (re-saved on each launch), the daily streak date and the last sign-in fill in.
create or replace function public.user_last_active_at(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    p.last_app_open_at,
    p.last_login_at,
    case when p.last_streak_date is not null
      then least((p.last_streak_date::timestamp + interval '12 hours') at time zone 'UTC', now()) end,
    (select max(coalesce(t.last_seen_at, t.updated_at)) from public.push_tokens t where t.user_id = p.id)
  )
  from public.profiles p
  where p.id = p_user_id;
$$;

-- The person's time zone: the one their phone reports, else a sensible one
-- for their country, else UTC.
create or replace function public.user_timezone(p_timezone text, p_country_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(p_timezone, ''),
    case upper(coalesce(p_country_code, ''))
      when 'GH' then 'Africa/Accra'
      when 'NG' then 'Africa/Lagos'
      when 'US' then 'America/Chicago'
      when 'GB' then 'Europe/London'
      when 'CA' then 'America/Toronto'
      when 'ZA' then 'Africa/Johannesburg'
      when 'DE' then 'Europe/Berlin'
      when 'FR' then 'Europe/Paris'
      when 'IT' then 'Europe/Rome'
      when 'ES' then 'Europe/Madrid'
      when 'NL' then 'Europe/Amsterdam'
      when 'UG' then 'Africa/Kampala'
      when 'TZ' then 'Africa/Dar_es_Salaam'
      when 'KE' then 'Africa/Nairobi'
      when 'RW' then 'Africa/Kigali'
      when 'ET' then 'Africa/Addis_Ababa'
      when 'SN' then 'Africa/Dakar'
      when 'CI' then 'Africa/Abidjan'
      when 'CM' then 'Africa/Douala'
      when 'TG' then 'Africa/Lome'
      when 'BJ' then 'Africa/Porto-Novo'
      when 'LR' then 'Africa/Monrovia'
      when 'SL' then 'Africa/Freetown'
      when 'MA' then 'Africa/Casablanca'
      when 'EG' then 'Africa/Cairo'
      when 'LY' then 'Africa/Tripoli'
      when 'AU' then 'Australia/Sydney'
      when 'IN' then 'Asia/Kolkata'
      when 'BR' then 'America/Sao_Paulo'
      when 'MX' then 'America/Mexico_City'
      else 'UTC'
    end
  );
$$;

-- 5. The eligibility rules -----------------------------------------------------

create or replace function public.push_eligibility(
  p_user_id uuid,
  p_category text,
  p_kind text,
  p_dedupe_key text default null
)
returns table (allowed boolean, reason text, tier text, local_hour integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_permission text;
  v_tz text;
  v_country text;
  v_last timestamptz;
  v_tier text;
  v_hour integer;
  v_cat text := lower(coalesce(nullif(p_category, ''), 'engagement'));
  v_kind text := lower(coalesce(nullif(p_kind, ''), 'system'));
  v_quiet boolean;
  v_count integer;
  v_last_sent timestamptz;
begin
  select p.account_status, p.notification_permission, p.timezone, p.country_code
    into v_status, v_permission, v_tz, v_country
  from public.profiles p where p.id = p_user_id;

  if not found then
    return query select false, 'no_profile'::text, null::text, null::integer;
    return;
  end if;

  v_last := public.user_last_active_at(p_user_id);
  v_tier := case
    when v_last is null then 'dormant'
    when v_last > now() - interval '7 days' then 'active'
    when v_last > now() - interval '30 days' then 'lapsed'
    when v_last > now() - interval '60 days' then 'inactive'
    else 'dormant'
  end;

  begin
    v_hour := extract(hour from (now() at time zone public.user_timezone(v_tz, v_country)))::integer;
  exception when others then
    v_hour := extract(hour from (now() at time zone 'UTC'))::integer;
  end;
  v_quiet := v_hour >= 22 or v_hour < 8;

  if coalesce(v_status, 'active') <> 'active' then
    return query select false, 'account_not_active'::text, v_tier, v_hour; return;
  end if;

  if not exists (select 1 from public.push_tokens t where t.user_id = p_user_id) then
    return query select false, 'no_device'::text, v_tier, v_hour; return;
  end if;

  if v_permission = 'denied' then
    return query select false, 'notifications_off'::text, v_tier, v_hour; return;
  end if;

  -- Same notification already sent recently (e.g. an older app version and
  -- the server both announcing the same match).
  if p_dedupe_key is not null and exists (
    select 1 from public.push_delivery_log l
    where l.user_id = p_user_id and l.dedupe_key = p_dedupe_key
      and l.decision = 'sent' and l.created_at > now() - interval '30 minutes'
  ) then
    return query select false, 'duplicate'::text, v_tier, v_hour; return;
  end if;

  if v_cat = 'transactional' then
    return query select true, 'transactional'::text, v_tier, v_hour; return;
  end if;

  if v_cat = 'event' then
    if v_kind = 'like' then
      if v_tier <> 'active' then
        return query select false, 'like_person_not_active'::text, v_tier, v_hour; return;
      end if;
      if v_quiet then
        return query select false, 'quiet_hours'::text, v_tier, v_hour; return;
      end if;
      select max(l.created_at) into v_last_sent from public.push_delivery_log l
      where l.user_id = p_user_id and l.kind = 'like' and l.decision = 'sent';
      if v_last_sent > now() - interval '3 hours' then
        return query select false, 'like_grouped'::text, v_tier, v_hour; return;
      end if;
    end if;
    -- Messages and matches from a real person: always.
    return query select true, 'event'::text, v_tier, v_hour; return;
  end if;

  -- Engagement (recommendations, comeback, games, streaks, broadcasts).
  if v_tier in ('inactive', 'dormant') then
    return query select false, 'inactive_no_engagement'::text, v_tier, v_hour; return;
  end if;
  if v_quiet then
    return query select false, 'quiet_hours'::text, v_tier, v_hour; return;
  end if;

  if v_tier = 'lapsed' then
    if exists (
      select 1 from public.push_delivery_log l
      where l.user_id = p_user_id and l.category = 'engagement' and l.decision = 'sent'
        and l.created_at > now() - interval '7 days'
    ) then
      return query select false, 'lapsed_weekly_cap'::text, v_tier, v_hour; return;
    end if;
    return query select true, 'engagement_lapsed'::text, v_tier, v_hour; return;
  end if;

  select count(*), max(l.created_at) into v_count, v_last_sent
  from public.push_delivery_log l
  where l.user_id = p_user_id and l.category = 'engagement' and l.decision = 'sent'
    and l.created_at > now() - interval '24 hours';
  if v_count >= 2 then
    return query select false, 'daily_cap'::text, v_tier, v_hour; return;
  end if;
  if v_last_sent > now() - interval '4 hours' then
    return query select false, 'too_soon'::text, v_tier, v_hour; return;
  end if;
  return query select true, 'engagement_active'::text, v_tier, v_hour;
end;
$$;

revoke all on function public.push_eligibility(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.user_last_active_at(uuid) from public, anon, authenticated;

-- 6. Called by the app on every open / return to foreground -----------------

create or replace function public.record_app_open(
  p_timezone text default null,
  p_notification_permission text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_perm text;
begin
  if v_uid is null then return; end if;

  if p_timezone is not null and length(p_timezone) <= 64
     and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    v_tz := p_timezone;
  end if;

  if p_notification_permission in ('granted', 'denied', 'prompt') then
    v_perm := p_notification_permission;
  end if;

  update public.profiles set
    last_app_open_at = now(),
    timezone = coalesce(v_tz, timezone),
    notification_permission = coalesce(v_perm, notification_permission),
    notification_permission_updated_at = case when v_perm is not null then now() else notification_permission_updated_at end
  where id = v_uid;

  update public.push_tokens set last_seen_at = now() where user_id = v_uid;
end;
$$;

revoke all on function public.record_app_open(text, text) from public, anon;
grant execute on function public.record_app_open(text, text) to authenticated;

-- 7. Called by the app when a notification is tapped -------------------------

create or replace function public.mark_notification_opened(p_notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set is_read = true, opened_at = coalesce(opened_at, now())
   where id = p_notification_id and user_id = auth.uid();
$$;

revoke all on function public.mark_notification_opened(uuid) from public, anon;
grant execute on function public.mark_notification_opened(uuid) to authenticated;
