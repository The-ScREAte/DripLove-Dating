-- Fix from the scale audit: get_admin_stats() runs several COUNT(*) full
-- table scans on every call. Most of the metrics in this function are
-- genuinely time-window/last_login-based (active_now, active_users_today,
-- active_users_30_days, new_users_this_week, matches_this_week, premium
-- status vs expiry) and can't be simple mutation counters - they change
-- purely by time passing, with no row write to hook a trigger on. Those are
-- deliberately left untouched below.
--
-- total_matches/total_likes/total_blocks/total_messages are the one clean
-- exception: plain, unfiltered "how many rows exist" counts with nothing
-- time-dependent about them. Those four move to a trigger-maintained
-- running-total table instead, updated incrementally on insert/delete
-- rather than recounted from scratch on every read.
--
-- Fetched the CURRENT live function body via pg_get_functiondef before
-- writing this migration (it had already diverged from every migration
-- file in the repo - a daily_active_stats table and refined
-- all_time_premium_users logic exist in production that no local migration
-- created) specifically so this replaces it with zero unrelated changes -
-- only the four counter lookups differ from what's live today.

CREATE TABLE IF NOT EXISTS public.admin_stats_counters (
  metric text PRIMARY KEY,
  count bigint NOT NULL DEFAULT 0
);

INSERT INTO public.admin_stats_counters (metric, count) VALUES
  ('total_matches', 0), ('total_likes', 0), ('total_blocks', 0), ('total_messages', 0)
ON CONFLICT (metric) DO NOTHING;

UPDATE public.admin_stats_counters SET count = (SELECT COUNT(*) FROM public.matches) WHERE metric = 'total_matches';
UPDATE public.admin_stats_counters SET count = (SELECT COUNT(*) FROM public.likes) WHERE metric = 'total_likes';
UPDATE public.admin_stats_counters SET count = (SELECT COUNT(*) FROM public.blocks) WHERE metric = 'total_blocks';
UPDATE public.admin_stats_counters SET count = (SELECT COUNT(*) FROM public.chats) WHERE metric = 'total_messages';

CREATE OR REPLACE FUNCTION public.bump_admin_stat(p_metric text, p_delta integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.admin_stats_counters SET count = count + p_delta WHERE metric = p_metric;
$$;

CREATE OR REPLACE FUNCTION public.trg_simple_admin_stat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.bump_admin_stat(TG_ARGV[0], 1);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.bump_admin_stat(TG_ARGV[0], -1);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_matches_admin_stats ON public.matches;
CREATE TRIGGER trg_matches_admin_stats
AFTER INSERT OR DELETE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.trg_simple_admin_stat('total_matches');

DROP TRIGGER IF EXISTS trg_likes_admin_stats ON public.likes;
CREATE TRIGGER trg_likes_admin_stats
AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.trg_simple_admin_stat('total_likes');

DROP TRIGGER IF EXISTS trg_blocks_admin_stats ON public.blocks;
CREATE TRIGGER trg_blocks_admin_stats
AFTER INSERT OR DELETE ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.trg_simple_admin_stat('total_blocks');

DROP TRIGGER IF EXISTS trg_chats_admin_stats ON public.chats;
CREATE TRIGGER trg_chats_admin_stats
AFTER INSERT OR DELETE ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.trg_simple_admin_stat('total_messages');

-- Identical to the live function, except total_matches/total_likes/
-- total_blocks/total_messages now read the maintained counters table
-- instead of scanning their tables fresh.
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

    -- Premium Now (STRICT: active premium subscriptions with valid expiry)
    'premium_users', (
      SELECT COUNT(DISTINCT us.user_id)
      FROM public.user_subscriptions us
      JOIN public.profiles p ON p.id = us.user_id
      WHERE p.is_admin = false
        AND us.plan_name = 'premium'
        AND us.status = 'active'
        AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ),

    -- All Time Premium (STRICT: only count premium who were ACTUALLY premium)
    -- 1) Currently active premium with valid expiry
    -- 2) Previously premium (cancelled/expired/payment_failed) who HAD valid premium time
    'all_time_premium_users', (
      SELECT COUNT(DISTINCT us.user_id)
      FROM public.user_subscriptions us
      JOIN public.profiles p ON p.id = us.user_id
      WHERE p.is_admin = false
        AND (
          -- Currently premium and not expired
          (us.plan_name = 'premium' AND us.status = 'active' AND (us.expires_at IS NULL OR us.expires_at > NOW()))
          OR
          -- Was premium but now cancelled/expired/failed (they DID have premium time)
          (us.plan_name = 'premium' AND us.status IN ('cancelled','canceled','expired','payment_failed'))
          OR
          -- Downgraded to free after being premium (cancelled/failed subscriptions)
          (us.plan_name = 'free' AND us.status IN ('cancelled','canceled','payment_failed'))
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
