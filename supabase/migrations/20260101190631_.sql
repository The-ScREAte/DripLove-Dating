-- Clean up duplicate passes: keep only the most recent pass per (passer_id, passed_id) pair
DELETE FROM public.passes p1
WHERE p1.id NOT IN (
  SELECT DISTINCT ON (passer_id, passed_id) id
  FROM public.passes
  ORDER BY passer_id, passed_id, passed_at DESC NULLS LAST
);

-- Clean up duplicate likes: keep only the most recent like per (liker_id, liked_id) pair
DELETE FROM public.likes l1
WHERE l1.id NOT IN (
  SELECT DISTINCT ON (liker_id, liked_id) id
  FROM public.likes
  ORDER BY liker_id, liked_id, created_at DESC NULLS LAST
);

-- Now add unique constraints
ALTER TABLE public.likes
ADD CONSTRAINT likes_unique_liker_liked UNIQUE (liker_id, liked_id);

ALTER TABLE public.passes
ADD CONSTRAINT passes_unique_passer_passed UNIQUE (passer_id, passed_id);

-- Create indexes for faster swipe history queries
CREATE INDEX IF NOT EXISTS idx_likes_liker_id ON public.likes(liker_id);
CREATE INDEX IF NOT EXISTS idx_passes_passer_id ON public.passes(passer_id);
CREATE INDEX IF NOT EXISTS idx_passes_passer_passed_at ON public.passes(passer_id, passed_at DESC);

-- Update the pass_and_usage_batched function to use upsert
CREATE OR REPLACE FUNCTION public.pass_and_usage_batched(passer_id_param uuid, passed_id_param uuid, premium_param boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  result jsonb := jsonb_build_object('allowed', true, 'ok', true);
begin
  -- Try to update usage if helper exists (non-fatal)
  begin
    perform update_user_usage(passer_id_param, 'swipe', 1);
  exception when others then
    null;
  end;

  -- Upsert pass: insert or update passed_at if already exists
  insert into passes (passer_id, passed_id, passed_at)
  values (passer_id_param, passed_id_param, now())
  on conflict (passer_id, passed_id) 
  do update set passed_at = now();

  return result;
exception when others then
  return jsonb_build_object('allowed', false, 'ok', false, 'error', sqlerrm);
end;
$function$;;
