-- All Time Premium on the admin dashboard read 1,329 when only ~142 people
-- have ever had premium.
--
-- The old query counted every subscription row with plan_name = 'free' and
-- status 'payment_failed' as "was premium". On 2026-09-25 the
-- subscription-checker's Paystack pass still ran over every subscription
-- (fixed 2026-09-26 by filtering on payment_method = 'paystack'); a free row
-- has no expires_at, new Date(null) reads as 1970, so it looked expired and
-- 1,205 ordinary free users were flipped to status 'payment_failed'. They
-- never paid, but the stat counted all of them.
--
-- All Time Premium now comes from premium_users_history, which a trigger
-- fills whenever a subscription becomes premium. That table's 2025-12-30
-- backfill only took users with a subscription_payments row, so Apple/Google
-- subscribers from before then were never recorded - they're added here.
--
-- Premium Now now matches what the app itself grants
-- (get_current_subscription_status): a premium row that is active, cancelled
-- (cancelled but not yet expired) or payment_pending, within the same
-- 30-minute grace period. It used to count 'active' only.

-- 1) Record everyone who has had a premium period but is missing from history.
INSERT INTO public.premium_users_history (user_id, first_premium_at, last_premium_at, total_subscription_count)
SELECT us.user_id,
       MIN(COALESCE(us.starts_at, us.created_at)),
       MAX(COALESCE(us.starts_at, us.created_at)),
       1
FROM public.user_subscriptions us
WHERE us.plan_name = 'premium'
   OR (us.expires_at IS NOT NULL AND us.payment_method IS NOT NULL)
   OR EXISTS (SELECT 1 FROM public.subscription_payments sp WHERE sp.user_id = us.user_id)
GROUP BY us.user_id
ON CONFLICT (user_id) DO NOTHING;

-- 2) Record on any move into an entitled premium state, not just 'active'.
--    Toggling between entitled states (e.g. undoing a cancel) isn't a new
--    subscription, so it doesn't bump the count.
CREATE OR REPLACE FUNCTION public.trigger_record_premium()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.plan_name = 'premium' AND NEW.status IN ('active', 'cancelled', 'payment_pending') THEN
    IF TG_OP = 'INSERT'
       OR OLD.plan_name IS DISTINCT FROM 'premium'
       OR OLD.status NOT IN ('active', 'cancelled', 'payment_pending') THEN
      PERFORM public.record_premium_subscription(NEW.user_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Same as the live function except premium_users and all_time_premium_users.
CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
  today_active_count INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Calculate today's active count fresh
  SELECT COUNT(*) INTO today_active_count
  FROM public.profiles
  WHERE last_login_at >= CURRENT_DATE
    AND is_admin = false;

  -- Record/update today's count in history
  INSERT INTO public.daily_active_stats (stat_date, active_count, updated_at)
  VALUES (CURRENT_DATE, today_active_count, now())
  ON CONFLICT (stat_date)
  DO UPDATE SET
    active_count = GREATEST(daily_active_stats.active_count, EXCLUDED.active_count),
    updated_at = now();

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles WHERE is_admin = false),
    'total_users_ever', COALESCE((
      SELECT stat_value FROM public.user_stats_history WHERE stat_type = 'total_users_ever'
    ), (SELECT COUNT(*) FROM public.profiles)),
    'active_users_30_days', (
      SELECT COUNT(*)
      FROM public.profiles
      WHERE is_admin = false
      AND (last_login_at >= NOW() - INTERVAL '30 days' OR (last_login_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'))
    ),
    'active_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'active' AND is_admin = false),
    'archived_users', (SELECT COUNT(*) FROM public.profiles WHERE is_archived = true AND is_admin = false),
    'total_matches', (SELECT count FROM public.admin_stats_counters WHERE metric = 'total_matches'),
    'total_likes', (SELECT count FROM public.admin_stats_counters WHERE metric = 'total_likes'),
    'total_blocks', (SELECT count FROM public.admin_stats_counters WHERE metric = 'total_blocks'),
    'total_messages', (SELECT count FROM public.admin_stats_counters WHERE metric = 'total_messages'),
    'pending_images', (SELECT COUNT(*) FROM public.user_images WHERE moderation_status = 'pending'),
    'blocked_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'blocked' AND is_admin = false),
    'users_on_hold', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'on_hold' AND is_admin = false),
    'total_admins', (SELECT COUNT(*) FROM public.profiles WHERE is_admin = TRUE),

    -- Premium Now: users the app currently treats as premium
    -- (same rule as get_current_subscription_status).
    'premium_users', (
      SELECT COUNT(DISTINCT us.user_id)
      FROM public.user_subscriptions us
      JOIN public.profiles p ON p.id = us.user_id
      WHERE p.is_admin = false
        AND us.plan_name = 'premium'
        AND us.status IN ('active', 'cancelled', 'payment_pending')
        AND (us.expires_at IS NULL OR us.expires_at > NOW() - INTERVAL '30 minutes')
    ),

    -- All Time Premium: everyone who has ever had premium (paid or trial),
    -- including today's premium users. Deleted accounts aren't counted, same
    -- as total_users.
    'all_time_premium_users', (
      SELECT COUNT(*)
      FROM public.profiles p
      WHERE p.is_admin = false
        AND (
          EXISTS (SELECT 1 FROM public.premium_users_history h WHERE h.user_id = p.id)
          OR EXISTS (
            SELECT 1 FROM public.user_subscriptions us
            WHERE us.user_id = p.id AND us.plan_name = 'premium'
          )
        )
    ),

    'active_now', (
      SELECT COUNT(*)
      FROM public.profiles
      WHERE last_login_at >= NOW() - INTERVAL '20 minutes'
        AND is_admin = false
    ),
    'active_users_today', today_active_count,
    'new_users_this_week', (
      SELECT COUNT(*)
      FROM public.profiles
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'matches_this_week', (
      SELECT COUNT(*)
      FROM public.matches
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    )
  ) INTO result;

  RETURN result;
END;
$function$;
