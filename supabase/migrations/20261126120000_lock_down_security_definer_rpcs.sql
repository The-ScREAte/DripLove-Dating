-- Security hardening: SECURITY DEFINER functions were callable by the anon role
-- (anyone holding the public anon key) with no auth checks inside.

-- 1) Server-only functions: only service_role (edge functions / cron) may call.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'auto_archive_inactive_users','bump_admin_stat','cleanup_incomplete_users',
      'get_all_time_premium_count','handle_subscription_expiry','handle_subscription_payment',
      'record_premium_subscription','process_pending_welcome_notifications',
      'test_subscription_info','claim_broadcast_recipients','release_stale_broadcast_recipients',
      'increment_badge_count','increment_email_account_usage',
      'get_influencer_referred_users','get_influencer_stats_usd')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

-- 2) Logged-in-user functions: revoke from anon only.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'delete_match_with_chats','get_current_subscription_status','get_user_subscription',
      'get_likers_page','like_and_usage_batched','pass_and_usage_batched','update_user_usage',
      'record_daily_login','circle_up_check_session','circle_up_request_session',
      'handle_payment_failure','get_influencer_full_stats')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- 3) RLS was disabled on a public table (only touched via SECURITY DEFINER fns).
ALTER TABLE public.admin_stats_counters ENABLE ROW LEVEL SECURITY;

-- 4) Pin search_path
ALTER FUNCTION public.increment_redirect_clicks(uuid) SET search_path = public;
ALTER FUNCTION public.increment_redirect_clicks(text) SET search_path = public;
