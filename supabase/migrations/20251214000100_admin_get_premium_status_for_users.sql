-- Admin RPC: batch premium status lookup for a set of users.
-- This mirrors the premium logic used in stats:
-- plan_name = 'premium' AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())

CREATE OR REPLACE FUNCTION public.admin_get_premium_status_for_users(
  target_user_ids UUID[]
)
RETURNS TABLE(
  user_id UUID,
  is_premium BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Return one row per requested user_id.
  -- Uses EXISTS for correctness and avoids row-multiplication.
  RETURN QUERY
  SELECT
    p.id AS user_id,
    EXISTS (
      SELECT 1
      FROM public.user_subscriptions us
      WHERE us.user_id = p.id
        AND us.plan_name = 'premium'
        AND us.status = 'active'
        AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ) AS is_premium
  FROM public.profiles p
  WHERE p.id = ANY(target_user_ids);
END;
$function$;
