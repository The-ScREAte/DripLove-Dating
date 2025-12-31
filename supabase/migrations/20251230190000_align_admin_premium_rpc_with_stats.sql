-- Align admin_get_premium_status_for_users with Platform Stats definition.
-- Premium Now is defined as: plan_name = 'premium' AND status = 'active'
-- (No expires_at check; some rows may have stale expires_at but still be marked active.)

CREATE OR REPLACE FUNCTION public.admin_get_premium_status_for_users(target_user_ids uuid[])
RETURNS TABLE(user_id uuid, is_premium boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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

  -- Return exactly one row per requested user_id.
  RETURN QUERY
  SELECT
    p.id AS user_id,
    EXISTS (
      SELECT 1
      FROM public.user_subscriptions us
      WHERE us.user_id = p.id
        AND us.plan_name = 'premium'
        AND us.status = 'active'
    ) AS is_premium
  FROM public.profiles p
  WHERE p.id = ANY(target_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_premium_status_for_users(uuid[]) TO authenticated;
