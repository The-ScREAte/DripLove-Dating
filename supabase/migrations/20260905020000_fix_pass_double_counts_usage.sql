-- CRITICAL FIX: pass_and_usage_batched was incrementing user_usage.swipes_used
-- internally (via `perform update_user_usage(...)`) AND the client separately
-- calls persistSwipeCount (DiscoverPage.tsx) after every successful pass,
-- which ALSO increments the same counter. Every single pass therefore counted
-- TWICE toward the daily swipe limit, while likes (like_and_usage_batched,
-- which never touched usage internally) only counted once - a real,
-- confirmed discrepancy: a user with 6 likes + 12 passes (18 real actions)
-- had swipes_used driven to 30 (6*1 + 12*2), hitting the cap at little more
-- than half their actual usage. Removing the internal call makes passes
-- symmetric with likes - usage is tracked exactly once per swipe, always via
-- the client's explicit persistSwipeCount call after the like/pass RPC
-- succeeds, for both directions.
CREATE OR REPLACE FUNCTION public.pass_and_usage_batched(passer_id_param uuid, passed_id_param uuid, premium_param boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  result jsonb := jsonb_build_object('allowed', true, 'ok', true);
begin
  -- Upsert pass: insert or update passed_at if already exists
  insert into passes (passer_id, passed_id, passed_at)
  values (passer_id_param, passed_id_param, now())
  on conflict (passer_id, passed_id)
  do update set passed_at = now();

  return result;
exception when others then
  return jsonb_build_object('allowed', false, 'ok', false, 'error', sqlerrm);
end;
$function$;
