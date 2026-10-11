-- Discover speed with feed boosts: the boosted get_random_discover_profiles
-- (20261011200000) numbered every eligible profile with row_number() before
-- the LIMIT, so each deck fetch read and sorted the whole pool again - 89ms
-- vs 0.6ms for an archived top-up, even with no boosts at all. That undid
-- the indexed ORDER BY + LIMIT from 20260912010000.
--
-- Same results, two cheap steps instead:
--  1. boosted - up to half the batch from live boosts, in feed order. The
--     planner either walks idx_profiles_discover_feed and probes feed_boosts
--     by primary key, or probes profiles per boost - whichever is smaller.
--  2. everyone else - the original indexed ORDER BY + LIMIT, skipping the
--     profiles picked in step 1. Boosted profiles beyond the half-batch cap
--     stay here in their normal place, as before.
-- Boosted first, then the rest, each in feed_random_weight order.
--
-- Measured on production data (Ghana, women, archived, limit 60, ~1,870
-- boosts - what the weekly job would boost today): 2.8ms. No boosts: 0.6ms.

create or replace function public.get_random_discover_profiles(
  p_country_codes text[], p_allowed_genders text[], p_archived boolean, p_excluded_ids uuid[] default '{}'::uuid[],
  p_limit integer default 100, p_lat double precision default null::double precision,
  p_lon double precision default null::double precision, p_radius_degrees double precision default null::double precision,
  p_allowed_ids uuid[] default null::uuid[]
)
returns setof public.profiles
language sql
stable
security definer
set search_path to ''
as $function$
  -- Both steps repeat the same filters on purpose: sharing them through one
  -- CTE would materialize the whole pool and lose the index's early stop.
  with boosted as materialized (
    select p as prof, p.id, p.feed_random_weight as weight
    from public.feed_boosts b
    join public.profiles p on p.id = b.user_id
    where b.boost_until > now()
      and p.country_code = any(p_country_codes)
      and p.gender = any(p_allowed_genders)
      and p.account_status = 'active'
      and p.is_admin = false
      and p.is_archived = p_archived
      and not (p.id = any(coalesce(p_excluded_ids, array[]::uuid[])))
      and (p_allowed_ids is null or p.id = any(p_allowed_ids))
      and (
        p_lat is null or p_lon is null or p_radius_degrees is null
        or (
          p.latitude between p_lat - p_radius_degrees and p_lat + p_radius_degrees
          and p.longitude between p_lon - p_radius_degrees and p_lon + p_radius_degrees
        )
      )
    order by p.feed_random_weight
    limit greatest(1, p_limit / 2)
  )
  select (picked.prof).*
  from (
    select bo.prof, 0 as tier, bo.weight
    from boosted bo
    union all
    (
      select p, 1, p.feed_random_weight
      from public.profiles p
      where p.country_code = any(p_country_codes)
        and p.gender = any(p_allowed_genders)
        and p.account_status = 'active'
        and p.is_admin = false
        and p.is_archived = p_archived
        and not (p.id = any(coalesce(p_excluded_ids, array[]::uuid[])))
        and not (p.id = any(array(select bo.id from boosted bo)))
        and (p_allowed_ids is null or p.id = any(p_allowed_ids))
        and (
          p_lat is null or p_lon is null or p_radius_degrees is null
          or (
            p.latitude between p_lat - p_radius_degrees and p_lat + p_radius_degrees
            and p.longitude between p_lon - p_radius_degrees and p_lon + p_radius_degrees
          )
        )
      order by p.feed_random_weight
      limit p_limit
    )
  ) picked
  order by picked.tier, picked.weight
  limit p_limit;
$function$;

grant execute on function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) to authenticated;
