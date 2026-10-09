-- Re-engagement, streak and game pushes: sent when they can actually arrive.
--
-- These jobs fired at fixed UTC times and marked people as done even when the
-- push was blocked (night time, the daily budget, smart quiet), so whole
-- regions never got them - and the hourly re-engagement job made ~3,000
-- blocked attempts a day for members gone 30+ days. Now each checks
-- push_eligibility first and only marks someone done when the push is allowed;
-- otherwise it tries again next hour.
--
--  * Re-engagement ("Ama, meet Kofi"): hourly as before, only members active in
--    the last 30 days who haven't logged in for a day.
--  * Streak reminder: hourly, in their local early evening (5-9pm); streaks run
--    on UTC days, so in the day's last UTC hours any local daytime hour.
--  * Streak ended: same nightly reset; the push is sent only when allowed, with
--    clearer wording.
--  * Game push: once a week on a Tuesday, Thursday or Sunday (their own,
--    spread across members) between 11am and 8pm local - one hourly job instead
--    of three fixed-time ones.

create or replace function public.send_reengagement_notifications()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rec record;
  v_is_premium boolean;
  v_candidate_id uuid;
  v_candidate record;
  v_trait text;
  v_age integer;
  v_title text;
  v_body text;
  v_allowed boolean;
begin
  for rec in
    select p.id as user_id, p.first_name, p.interests, p.languages, p.pets,
           p.adinkra_symbols, p.communication_style, p.love_style,
           p.relationship_intent, p.family_plans,
           p.gender, p.preference, p.country_code, p.last_reengagement_sent_at
    from public.profiles p
    where p.account_status = 'active'
      and p.is_admin is not true
      and p.last_login_at is not null
      and p.last_login_at < now() - interval '24 hours'
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
      and (
        p.last_reengagement_sent_at is null
        or p.last_reengagement_sent_at < now() - interval '10 hours'
      )
      -- Gone 30+ days: push_eligibility never allows these, so don't try.
      and public.user_last_active_at(p.id) > now() - interval '30 days'
    order by p.last_reengagement_sent_at nulls first
    limit 2000
  loop
    -- Isolates one user's failure (a slow query, an unexpected null, a
    -- transient error) from the rest of the batch.
    begin
      select exists (
        select 1 from public.user_subscriptions us
        where us.user_id = rec.user_id
          and us.plan_name = 'premium'
          and us.status in ('active', 'cancelled')
          and (us.expires_at is null or us.expires_at > now())
      ) into v_is_premium;

      if v_is_premium then
        if rec.last_reengagement_sent_at is not null and rec.last_reengagement_sent_at > now() - interval '10 hours' then
          continue;
        end if;
      else
        if rec.last_reengagement_sent_at is not null and rec.last_reengagement_sent_at > now() - interval '24 hours' then
          continue;
        end if;
      end if;

      -- Night time, the daily budget or smart quiet: try again next hour.
      select e.allowed into v_allowed
      from public.push_eligibility(rec.user_id, 'engagement', 'reengagement', null) e;
      if not coalesce(v_allowed, false) then
        continue;
      end if;

      v_candidate_id := null;
      select pid into v_candidate_id
      from (
        select unnest(profile_ids) as pid
        from public.circle_row_batches
        where user_id = rec.user_id and row_key = 'recommended'
      ) candidates
      where not exists (select 1 from public.likes l where l.liker_id = rec.user_id and l.liked_id = candidates.pid)
        and not exists (select 1 from public.passes ps where ps.passer_id = rec.user_id and ps.passed_id = candidates.pid)
        and not exists (
          select 1 from public.matches m
          where (m.user1_id = rec.user_id and m.user2_id = candidates.pid)
             or (m.user2_id = rec.user_id and m.user1_id = candidates.pid)
        )
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = rec.user_id and b.blocked_id = candidates.pid)
             or (b.blocker_id = candidates.pid and b.blocked_id = rec.user_id)
        )
      limit 1;

      if v_candidate_id is null then
        select cand.id into v_candidate_id
        from public.profiles cand
        where cand.account_status = 'active'
          and cand.is_admin is not true
          and cand.is_archived is not true
          and cand.id <> rec.user_id
          and cand.country_code = rec.country_code
          and (rec.preference = 'everyone' or cand.gender = rec.preference)
          and (cand.preference = 'everyone' or cand.preference = rec.gender)
          and exists (
            select 1 from public.user_images ui
            where ui.user_id = cand.id and ui.is_approved = true and ui.image_order <> -1
          )
          and not exists (select 1 from public.likes l where l.liker_id = rec.user_id and l.liked_id = cand.id)
          and not exists (select 1 from public.passes ps where ps.passer_id = rec.user_id and ps.passed_id = cand.id)
          and not exists (
            select 1 from public.matches m
            where (m.user1_id = rec.user_id and m.user2_id = cand.id)
               or (m.user2_id = rec.user_id and m.user1_id = cand.id)
          )
          and not exists (
            select 1 from public.blocks b
            where (b.blocker_id = rec.user_id and b.blocked_id = cand.id)
               or (b.blocker_id = cand.id and b.blocked_id = rec.user_id)
          )
        order by
          (coalesce(rec.interests, '{}'::text[]) && coalesce(cand.interests, '{}'::text[])) desc,
          cand.feed_random_weight
        limit 1;
      end if;

      if v_candidate_id is null then
        continue;
      end if;

      select first_name, date_of_birth, city, country, interests, languages,
             pets, adinkra_symbols, communication_style, love_style,
             relationship_intent, family_plans
      into v_candidate
      from public.profiles
      where id = v_candidate_id;

      if nullif(trim(v_candidate.first_name), '') is null then
        continue;
      end if;

      v_trait := public.pick_shared_trait(
        rec.interests, rec.languages, rec.pets, rec.relationship_intent,
        v_candidate.interests, v_candidate.languages, v_candidate.pets,
        v_candidate.relationship_intent
      );

      v_age := case when v_candidate.date_of_birth is not null
        then extract(year from age(v_candidate.date_of_birth))::int
        else null end;

      v_title := coalesce(nullif(trim(rec.first_name), '') || ', meet ', 'Meet ') || v_candidate.first_name || ' 👋';

      v_body := public.build_profile_push_body(
        v_candidate.first_name, v_age, v_candidate.city, v_trait
      );

      perform net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'userId', rec.user_id,
          'type', 'system',
          'data', jsonb_build_object(
            'action', 'open_circle_profile',
            'profileId', v_candidate_id,
            'senderId', v_candidate_id
          )
        )
      );

      update public.profiles set last_reengagement_sent_at = now() where id = rec.user_id;
    exception when others then
      raise warning 'send_reengagement_notifications: skipping user % after error: %', rec.user_id, sqlerrm;
    end;
  end loop;
end;
$function$;

create or replace function public.send_streak_reminder_notifications()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rec record;
  v_today date := (now() at time zone 'utc')::date;
  v_utc_hour integer := extract(hour from (now() at time zone 'utc'))::integer;
  v_allowed boolean;
begin
  for rec in
    select p.id as user_id, p.current_streak,
           extract(hour from (now() at time zone public.user_timezone(p.timezone, p.country_code)))::integer as local_hour
    from public.profiles p
    where p.account_status = 'active'
      and p.is_admin is not true
      and p.current_streak > 0
      and p.last_streak_date = v_today - 1
      and p.last_streak_reminder_sent_date is distinct from v_today
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
    limit 5000
  loop
    begin
      -- Their early evening; streaks run on UTC days, so in the day's last
      -- three UTC hours any local daytime hour will do.
      continue when not (rec.local_hour between 17 and 20
                         or (v_utc_hour >= 21 and rec.local_hour between 8 and 21));
      select e.allowed into v_allowed
      from public.push_eligibility(rec.user_id, 'engagement', 'streak_reminder', null) e;
      continue when not coalesce(v_allowed, false);

      perform net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', 'Keep your ' || rec.current_streak || '-day streak going 🔥',
          'body', 'Open DripLove today to keep it and stay prioritised for matches.',
          'userId', rec.user_id,
          'type', 'system',
          'data', jsonb_build_object('action', 'open_discover', 'showStreakBanner', true)
        )
      );

      update public.profiles set last_streak_reminder_sent_date = v_today where id = rec.user_id;
    exception when others then
      raise warning 'send_streak_reminder_notifications: skipping user % after error: %', rec.user_id, sqlerrm;
    end;
  end loop;
end;
$function$;

create or replace function public.send_streak_broken_notifications()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rec record;
  v_today date := (now() at time zone 'utc')::date;
  v_allowed boolean;
begin
  for rec in
    select p.id as user_id
    from public.profiles p
    where p.account_status = 'active'
      and p.is_admin is not true
      and p.current_streak > 0
      and p.last_streak_date <= v_today - 2
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
    limit 5000
  loop
    begin
      select e.allowed into v_allowed
      from public.push_eligibility(rec.user_id, 'engagement', 'streak_ended', null) e;
      if coalesce(v_allowed, false) then
        perform net.http_post(
          url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
          ),
          body := jsonb_build_object(
            'title', 'Your streak has ended',
            'body', 'Start a new one today to stay prioritised for matches.',
            'userId', rec.user_id,
            'type', 'system',
            'data', jsonb_build_object('action', 'open_discover')
          )
        );
      end if;
      update public.profiles set current_streak = 0 where id = rec.user_id;
    exception when others then
      raise warning 'send_streak_broken_notifications: skipping user % after error: %', rec.user_id, sqlerrm;
    end;
  end loop;
end;
$function$;

-- p_remaining_days is no longer used (kept so old callers still work).
create or replace function public.send_game_notifications(p_remaining_days integer default 1)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rec record;
  v_title text;
  v_body text;
  v_pick integer;
  v_allowed boolean;
begin
  for rec in
    select p.id, p.gender, z.local_now, date_trunc('week', z.local_now)::date as week_start,
           -- Each member's own game day this week: Tue, Thu or Sun.
           (array[2, 4, 7])[1 + mod(abs(hashtext(p.id::text || date_trunc('week', z.local_now)::date::text)), 3)] as game_day
    from public.profiles p
    cross join lateral (
      select now() at time zone public.user_timezone(p.timezone, p.country_code) as local_now
    ) z
    where p.account_status = 'active'
      and p.is_admin is not true
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
      and extract(isodow from z.local_now) in (2, 4, 7)
      and extract(hour from z.local_now) between 11 and 19
      and p.last_game_notification_sent_week is distinct from date_trunc('week', z.local_now)::date
    limit 20000
  loop
    begin
      -- On their day, or a later game day this week if that one didn't work out.
      continue when extract(isodow from rec.local_now) < rec.game_day;
      select e.allowed into v_allowed
      from public.push_eligibility(rec.id, 'engagement', 'game', null) e;
      continue when not coalesce(v_allowed, false);

      v_pick := floor(random() * 4)::int;
      case v_pick
        when 0 then
          v_title := 'Level up 🎮';
          v_body := 'Test your toast — how smooth are your lines?';
        when 1 then
          v_title := 'One shot 🎯';
          v_body := 'One message, one shot. Make it count.';
        when 2 then
          v_title := 'Red flag or green flag? 🚩';
          v_body := 'Test your dating instincts.';
        else
          v_title := 'Practice makes perfect 💬';
          v_body := 'Improve your toast — get the ' ||
            case rec.gender when 'male' then 'girl' when 'female' then 'man' else 'person' end || ' of your dreams';
      end case;

      perform net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'userId', rec.id,
          'type', 'system',
          'data', jsonb_build_object('action', 'open_games')
        )
      );

      update public.profiles set last_game_notification_sent_week = rec.week_start where id = rec.id;
    exception when others then
      raise warning 'send_game_notifications: skipping user % after error: %', rec.id, sqlerrm;
    end;
  end loop;
end;
$function$;

-- Jobs: streak reminders and game pushes hourly (their local time decides).
select cron.alter_job((select jobid from cron.job where jobname = 'send-streak-reminder-notifications'), schedule := '15 * * * *');
select cron.unschedule(jobname) from cron.job
 where jobname in ('send-game-notifications-sunday', 'send-game-notifications-thursday', 'send-game-notifications-tuesday');
select cron.schedule('send-game-notifications-hourly', '45 * * * *', $$select public.send_game_notifications();$$);
