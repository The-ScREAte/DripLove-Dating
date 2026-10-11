-- Users list speed: admin_search_users_page took ~11s a page because the
-- photo count ran a full user_images scan once per profile. Count photos for
-- everyone in one grouped pass instead. Same filters, sort and results.

create or replace function public.admin_search_users_page(
  p_search text default null::text, p_status text default 'all'::text, p_gender text default 'all'::text,
  p_preference text default 'all'::text, p_country text default 'all'::text,
  p_relationship_intent text default 'all'::text, p_premium text default 'all'::text,
  p_activity text default 'all'::text, p_archive text default 'all'::text,
  p_limit integer default 20, p_offset integer default 0,
  p_photos text default 'all'::text, p_completion text default 'all'::text,
  p_seen text default 'all'::text, p_boost text default 'all'::text, p_sort text default 'newest'::text
)
returns table(
  id uuid, first_name text, last_name text, email text, account_status text, created_at timestamp with time zone,
  city text, country text, date_of_birth date, is_admin boolean, gender text, preference text,
  relationship_intent text, last_login_at timestamp with time zone, login_count integer, is_archived boolean,
  is_premium boolean, total_count bigint,
  active_session_count integer, photo_count integer, profile_completion integer,
  likes_received bigint, passes_received bigint, boost_until timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Table-qualified throughout: RETURNS TABLE(id uuid, ...) creates OUT
  -- parameters that would shadow unqualified column names.
  if not exists (
    select 1 from public.profiles admin_check
    where admin_check.id = auth.uid() and admin_check.is_admin = true
  ) then
    raise exception 'Unauthorized: Admin access required';
  end if;

  return query
  with filtered as (
    select p.id as pid, p.created_at as p_created, p.last_login_at as p_last,
           coalesce(p.login_count, 0) as p_logins, coalesce(p.active_session_count, 0) as p_sessions,
           ph.photos, pc.completion,
           count(*) over () as total
    from public.profiles p
    -- One pass over user_images for everyone (a per-profile count can't use
    -- the partial user_id indexes and scanned the whole table 5,000 times).
    left join (
      select ui.user_id, count(*)::integer as photos
      from public.user_images ui
      where ui.is_approved is distinct from false and coalesce(ui.image_order, 0) <> -1
      group by ui.user_id
    ) photo_counts on photo_counts.user_id = p.id
    cross join lateral (select coalesce(photo_counts.photos, 0) as photos) ph
    cross join lateral (select public.profile_completion_percent(p, ph.photos) as completion) pc
    where p.is_admin = false
      and (p_search is null or p_search = '' or (
        p.first_name ilike '%' || p_search || '%'
        or p.last_name ilike '%' || p_search || '%'
        or p.email ilike '%' || p_search || '%'
        or p.city ilike '%' || p_search || '%'
        or p.country ilike '%' || p_search || '%'
        or p.id::text ilike '%' || p_search || '%'
      ))
      and (p_status = 'all' or p.account_status = p_status)
      and (p_gender = 'all' or p.gender = p_gender)
      and (p_preference = 'all' or p.preference = p_preference)
      and (p_country = 'all' or p.country = p_country)
      and (p_relationship_intent = 'all' or p.relationship_intent = p_relationship_intent)
      and (p_archive = 'all' or (p_archive = 'archived' and p.is_archived = true)
           or (p_archive = 'active' and coalesce(p.is_archived, false) = false))
      and (
        p_activity = 'all' or (
          case p_activity
            when 'today' then coalesce(p.last_login_at, p.created_at) >= date_trunc('day', now())
            when '3_days' then coalesce(p.last_login_at, p.created_at) >= now() - interval '3 days'
            when '1_week' then coalesce(p.last_login_at, p.created_at) >= now() - interval '7 days'
            when '2_weeks' then coalesce(p.last_login_at, p.created_at) >= now() - interval '14 days'
            when '1_month' then coalesce(p.last_login_at, p.created_at) >= now() - interval '30 days'
            when '3_months' then coalesce(p.last_login_at, p.created_at) >= now() - interval '90 days'
            when 'inactive_month' then coalesce(p.last_login_at, p.created_at) < now() - interval '30 days'
            else true
          end
        )
      )
      and (
        p_premium = 'all' or (
          (p_premium = 'premium') = exists (
            select 1 from public.user_subscriptions us
            where us.user_id = p.id and us.plan_name = 'premium' and us.status = 'active'
          )
        )
      )
      and (p_photos = 'all' or (p_photos = 'with' and ph.photos > 0) or (p_photos = 'without' and ph.photos = 0))
      and (p_completion = 'all'
           or (p_completion = '0_25' and pc.completion < 25)
           or (p_completion = '25_50' and pc.completion >= 25 and pc.completion < 50)
           or (p_completion = '50_75' and pc.completion >= 50 and pc.completion < 75)
           or (p_completion = '75_100' and pc.completion >= 75)
           or (p_completion = 'incomplete' and pc.completion < 100))
      and (p_seen = 'all'
           or (p_seen = 'never'
               and not exists (select 1 from public.likes l where l.liked_id = p.id)
               and not exists (select 1 from public.passes ps where ps.passed_id = p.id))
           or (p_seen = 'not_30_days'
               and not exists (select 1 from public.likes l where l.liked_id = p.id and l.created_at > now() - interval '30 days')
               and not exists (select 1 from public.passes ps where ps.passed_id = p.id and ps.passed_at > now() - interval '30 days'))
           or (p_seen = 'seen'
               and (exists (select 1 from public.likes l where l.liked_id = p.id)
                    or exists (select 1 from public.passes ps where ps.passed_id = p.id))))
      and (p_boost = 'all'
           or (p_boost = 'boosted') = exists (
             select 1 from public.feed_boosts b where b.user_id = p.id and b.boost_until > now()))
  ),
  page as (
    select f.*,
           row_number() over (
             order by
               case when p_sort = 'oldest' then f.p_created end asc,
               case when p_sort = 'last_active' then coalesce(f.p_last, f.p_created) end desc nulls last,
               case when p_sort = 'most_logins' then f.p_logins end desc,
               case when p_sort = 'most_active' then f.p_sessions end desc,
               case when p_sort = 'least_complete' then f.completion end asc,
               case when p_sort = 'most_complete' then f.completion end desc,
               f.p_created desc
           ) as rn
    from filtered f
  )
  select p.id, p.first_name, p.last_name, p.email, p.account_status, p.created_at,
         p.city::text, p.country, p.date_of_birth, p.is_admin, p.gender, p.preference,
         p.relationship_intent, p.last_login_at, p.login_count, p.is_archived,
         exists (
           select 1 from public.user_subscriptions us
           where us.user_id = p.id and us.plan_name = 'premium' and us.status = 'active'
         ) as is_premium,
         pg.total,
         pg.p_sessions, pg.photos, pg.completion,
         (select count(*) from public.likes l where l.liked_id = p.id),
         (select count(*) from public.passes ps where ps.passed_id = p.id),
         (select b.boost_until from public.feed_boosts b where b.user_id = p.id and b.boost_until > now())
  from page pg
  join public.profiles p on p.id = pg.pid
  where pg.rn > p_offset and pg.rn <= p_offset + p_limit
  order by pg.rn;
end;
$function$;
revoke all on function public.admin_search_users_page(text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, text, text) from public, anon;
grant execute on function public.admin_search_users_page(text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, text, text) to authenticated;
