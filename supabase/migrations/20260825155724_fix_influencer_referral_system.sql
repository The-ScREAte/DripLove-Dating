-- Comprehensive fix for the influencer/promo-code/referral system.
--
-- Found while auditing "what happens when someone signs up with a promo code" and
-- "the admin view is a bit different from the influencer view":
--
-- 1. CRITICAL money bug: the influencer portal shows/collects payout amounts in
--    USD, but request_influencer_payout stored that raw number directly as
--    payout_requests.amount, which every other part of the system (admin panel,
--    influencer_commissions, promo_codes.total_commission_earned) treats as GHS.
--    A request for "$50" was being recorded as "GHS 50" (~16x too small at the
--    ~16 GHS/USD rate used elsewhere in this codebase) -- influencers would have
--    been underpaid by roughly 16x if an admin ever paid out trusting that number.
-- 2. process_referral_commission (which pays out commission on every successful
--    subscription payment) was never REVOKEd from PUBLIC/anon/authenticated, so
--    any logged-in client could call it directly with a forged p_payment_amount to
--    fabricate arbitrary commission for a promo code they know about.
-- 3. request_influencer_payout had no identity binding (any caller who knew a
--    promo_code_id could request a payout for it) and no server-side balance
--    check (the "amount <= available balance" check only existed client-side).
-- 4. Influencer passwords are compared with plain string equality
--    (password_hash != password_input) despite the column being named
--    password_hash, and both the "set new password" RPC and the admin panel's
--    "edit promo code" write raw plaintext into that column.
-- 5. The "Anyone can view active promo codes" RLS policy has no column
--    restriction, so any unauthenticated client can SELECT the password_hash
--    column for any active promo code -- confirmed exploited by
--    InfluencerSetPassword.tsx's own (legitimate) direct table read.
-- 6. user_referral_deductions has a "System can manage deductions" policy with
--    USING (true) FOR ALL -- any client can INSERT/UPDATE/DELETE any row, e.g.
--    resetting their own deductions_used back to 0 to bypass the commission cap.
-- 7. subscription_payments has "System can insert payments" WITH CHECK (true) --
--    wide open; no legitimate client-side insert path exists (all real writes
--    come from the payment webhooks, which use the service role key and bypass
--    RLS regardless).
-- 8. The admin dashboard (InfluencerManagement.tsx) recomputed signup/subscriber/
--    commission counts via three separate client-side queries + hand-written JS
--    aggregation, duplicating (and able to silently drift from) the SQL logic
--    already living in get_influencer_stats_usd/influencer_login. This migration
--    adds one canonical stats function both the admin panel and the influencer
--    portal are updated to call, so they can never show different numbers for
--    the same promo code again.

-- Supabase installs extensions into the `extensions` schema by default; if
-- pgcrypto somehow doesn't exist yet, install it there explicitly. The four
-- functions below that call crypt()/gen_salt() set search_path to
-- 'public, extensions' (rather than this codebase's usual '') specifically so
-- those calls resolve regardless of which of the two schemas actually holds
-- pgcrypto -- every table reference in them is still fully schema-qualified,
-- so this doesn't reopen any search-path-hijacking risk.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. Canonical stats function -- single source of truth for both the admin
--    dashboard and the influencer portal.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_influencer_full_stats(p_promo_code_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_total_signups int;
  v_total_subscribers int;
  v_total_commission_ghs numeric;
  v_total_paid_ghs numeric;
  v_outstanding_ghs numeric;
  v_pending_requests int;
  v_exchange_rate numeric := 16.0; -- GHS per USD, matches the rate used elsewhere
BEGIN
  SELECT COUNT(*) INTO v_total_signups
  FROM public.referrals
  WHERE promo_code_id = p_promo_code_id;

  SELECT COUNT(DISTINCT r.user_id) INTO v_total_subscribers
  FROM public.referrals r
  INNER JOIN public.user_subscriptions us ON us.user_id = r.user_id
  WHERE r.promo_code_id = p_promo_code_id
    AND r.user_id IS NOT NULL
    AND us.plan_name = 'premium'
    AND us.status IN ('active', 'cancelled')
    AND (us.expires_at IS NULL OR us.expires_at > NOW());

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission_ghs
  FROM public.influencer_commissions
  WHERE promo_code_id = p_promo_code_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid_ghs
  FROM public.payout_requests
  WHERE promo_code_id = p_promo_code_id AND status = 'completed';

  SELECT COUNT(*) INTO v_pending_requests
  FROM public.payout_requests
  WHERE promo_code_id = p_promo_code_id AND status = 'pending';

  v_outstanding_ghs := GREATEST(v_total_commission_ghs - v_total_paid_ghs, 0);

  RETURN json_build_object(
    'total_signups', v_total_signups,
    'total_subscribers', v_total_subscribers,
    'total_commission_ghs', ROUND(v_total_commission_ghs, 2),
    'total_commission_usd', ROUND(v_total_commission_ghs / v_exchange_rate, 2),
    'total_paid_ghs', ROUND(v_total_paid_ghs, 2),
    'total_paid_usd', ROUND(v_total_paid_ghs / v_exchange_rate, 2),
    'outstanding_ghs', ROUND(v_outstanding_ghs, 2),
    'outstanding_usd', ROUND(v_outstanding_ghs / v_exchange_rate, 2),
    'pending_requests', v_pending_requests,
    'has_pending_payout', v_pending_requests > 0,
    'exchange_rate', v_exchange_rate
  );
END;
$function$;

-- Callable by any authenticated client (admin panel) and by other SECURITY
-- DEFINER functions below. Returns only aggregate counts/sums for a promo code
-- that's already visible via "Anyone can view active promo codes" -- no PII.
GRANT EXECUTE ON FUNCTION public.get_influencer_full_stats(uuid) TO authenticated, service_role;

-- ============================================================================
-- 2. influencer_login: use the canonical stats function, and accept either a
--    legacy plaintext password (comparing directly, then transparently
--    upgrading it to a real bcrypt hash on success) or an already-hashed one.
--    This is a self-healing migration -- no influencer needs to reset their
--    password, but every login from here on leaves that row properly hashed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.influencer_login(code_input text, password_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_promo_code RECORD;
  v_password_ok boolean;
  v_stats json;
BEGIN
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(code_input)
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;

  IF v_promo_code.password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;

  IF v_promo_code.password_hash LIKE '$2%' THEN
    -- Already a bcrypt hash.
    v_password_ok := (crypt(password_input, v_promo_code.password_hash) = v_promo_code.password_hash);
  ELSE
    -- Legacy plaintext value (or a not-yet-consumed setup token) -- compare
    -- directly, then upgrade to a real hash so it's never stored in the clear
    -- again after this point.
    v_password_ok := (v_promo_code.password_hash = password_input);
    IF v_password_ok THEN
      UPDATE public.promo_codes
      SET password_hash = crypt(password_input, gen_salt('bf'))
      WHERE id = v_promo_code.id;
    END IF;
  END IF;

  IF NOT v_password_ok THEN
    RETURN json_build_object('success', false, 'error', 'Invalid password');
  END IF;

  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;

  v_stats := public.get_influencer_full_stats(v_promo_code.id);

  RETURN json_build_object(
    'success', true,
    'promo_code_id', v_promo_code.id,
    'code', v_promo_code.code,
    'owner_name', v_promo_code.owner_name,
    'email', v_promo_code.email,
    'percentage_cut', v_promo_code.percentage_cut,
    'commission_duration', COALESCE(v_promo_code.commission_duration, 12),
    'status', COALESCE(v_promo_code.status, 'active'),
    'total_signups', v_stats->'total_signups',
    'total_subscribers', v_stats->'total_subscribers',
    'total_commission', v_stats->'total_commission_ghs',
    'total_commission_usd', v_stats->'total_commission_usd',
    'total_commission_ghs_raw', v_stats->'total_commission_ghs',
    'total_paid_ghs', v_stats->'total_paid_ghs',
    'total_paid_usd', v_stats->'total_paid_usd',
    'outstanding_ghs', v_stats->'outstanding_ghs',
    'outstanding_usd', v_stats->'outstanding_usd',
    'has_pending_payout', v_stats->'has_pending_payout',
    'exchange_rate', v_stats->'exchange_rate'
  );
END;
$function$;

-- ============================================================================
-- 3. set_influencer_password: always store a real bcrypt hash going forward.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_influencer_password(
  p_promo_code_id uuid,
  p_token text,
  p_new_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_promo_code RECORD;
BEGIN
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE id = p_promo_code_id
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid link');
  END IF;

  -- The setup token is stored in password_hash until a real password is set
  -- (it's a short-lived, one-time bootstrap value, always plaintext at
  -- creation time -- see admin's handleCreatePromoCode).
  IF v_promo_code.password_hash IS NULL OR v_promo_code.password_hash != p_token THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or already-used setup link');
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RETURN json_build_object('success', false, 'error', 'Password must be at least 6 characters');
  END IF;

  UPDATE public.promo_codes
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      status = CASE WHEN status = 'pending_password' THEN 'active' ELSE status END,
      is_active = true,
      updated_at = now()
  WHERE id = p_promo_code_id;

  RETURN json_build_object('success', true, 'message', 'Password set successfully');
END;
$function$;

-- ============================================================================
-- 4. New admin-only RPC to change an influencer's password -- replaces the
--    admin panel's previous direct client-side write of the plaintext password
--    into promo_codes.password_hash.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_set_influencer_password(
  p_promo_code_id uuid,
  p_new_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RETURN json_build_object('success', false, 'error', 'Password must be at least 6 characters');
  END IF;

  UPDATE public.promo_codes
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_promo_code_id;

  RETURN json_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_influencer_password(uuid, text) TO authenticated;

-- ============================================================================
-- 5. validate_promo_code_setup_link: lets InfluencerSetPassword.tsx confirm a
--    setup link is valid (and show the influencer's name) WITHOUT ever reading
--    promo_codes.password_hash from the client.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_promo_code_setup_link(
  p_promo_code_id uuid,
  p_token text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_promo_code RECORD;
BEGIN
  SELECT id, code, owner_name, status, password_hash INTO v_promo_code
  FROM public.promo_codes
  WHERE id = p_promo_code_id
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid link');
  END IF;

  IF v_promo_code.password_hash IS NULL OR v_promo_code.password_hash != p_token THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid or already-used setup link');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'code', v_promo_code.code,
    'owner_name', v_promo_code.owner_name
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_promo_code_setup_link(uuid, text) TO authenticated, anon;

-- ============================================================================
-- 6. request_influencer_payout: fixed to (a) accept the amount in GHS -- the
--    same currency as every other balance in this system -- instead of the
--    raw USD number the portal was sending, (b) re-verify the influencer's own
--    code+password instead of trusting a bare promo_code_id from any caller,
--    and (c) reject any amount over the actual server-computed outstanding
--    balance. The old (uuid, numeric) signature is dropped so it can't be
--    called anymore even from an old cached client build.
-- ============================================================================
DROP FUNCTION IF EXISTS public.request_influencer_payout(uuid, numeric);

CREATE OR REPLACE FUNCTION public.request_influencer_payout(
  p_code text,
  p_password text,
  p_amount_ghs numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_promo_code RECORD;
  v_password_ok boolean;
  v_stats json;
  v_outstanding numeric;
  v_pending_exists boolean;
BEGIN
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(p_code)
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL OR v_promo_code.password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_promo_code.password_hash LIKE '$2%' THEN
    v_password_ok := (crypt(p_password, v_promo_code.password_hash) = v_promo_code.password_hash);
  ELSE
    v_password_ok := (v_promo_code.password_hash = p_password);
  END IF;

  IF NOT v_password_ok THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payout_requests
    WHERE promo_code_id = v_promo_code.id AND status = 'pending'
  ) INTO v_pending_exists;

  IF v_pending_exists THEN
    RETURN json_build_object('success', false, 'error', 'You already have a pending payout request');
  END IF;

  IF p_amount_ghs IS NULL OR p_amount_ghs <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  v_stats := public.get_influencer_full_stats(v_promo_code.id);
  v_outstanding := (v_stats->>'outstanding_ghs')::numeric;

  IF p_amount_ghs > v_outstanding THEN
    RETURN json_build_object('success', false, 'error', 'Amount exceeds available balance');
  END IF;

  INSERT INTO public.payout_requests (promo_code_id, amount, status)
  VALUES (v_promo_code.id, p_amount_ghs, 'pending');

  RETURN json_build_object('success', true, 'message', 'Payout request submitted');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_influencer_payout(text, text, numeric) TO authenticated, anon;

-- ============================================================================
-- 7. process_referral_commission: only the payment webhooks (which run with
--    the service role key) have any legitimate reason to call this -- lock it
--    down so an authenticated client can no longer fabricate commission by
--    calling it directly with a forged payment amount.
-- ============================================================================
REVOKE ALL ON FUNCTION public.process_referral_commission(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_commission(uuid, numeric, uuid) TO service_role;

-- ============================================================================
-- 8. RLS: close the open-write gap on user_referral_deductions. The one
--    legitimate writer (process_referral_commission) is SECURITY DEFINER and
--    owned by a role that bypasses RLS, so it needs no policy of its own here.
-- ============================================================================
DROP POLICY IF EXISTS "System can manage deductions" ON public.user_referral_deductions;

-- ============================================================================
-- 9. RLS: close the open-insert gap on subscription_payments. Every real
--    insert comes from the payment webhooks via the service role key, which
--    bypasses RLS regardless -- there is no legitimate client-side insert path.
-- ============================================================================
DROP POLICY IF EXISTS "System can insert payments" ON public.subscription_payments;

-- ============================================================================
-- 10. RLS: stop exposing promo_codes.password_hash to any client. The only
--     legitimate client-side read of it has been replaced by
--     validate_promo_code_setup_link() above (#5), so nothing needs direct
--     column access anymore.
-- ============================================================================
REVOKE SELECT (password_hash) ON public.promo_codes FROM authenticated, anon;

-- ============================================================================
-- 11. New RPC so the influencer portal can show "who signed up with my code,
--     and has each one actually subscribed" -- previously the portal only
--     showed aggregate counts, with no per-user visibility at all. Re-verifies
--     the influencer's own code+password (same pattern as
--     request_influencer_payout, #6) rather than trusting a bare
--     promo_code_id, and returns only first name + last initial + signup date
--     + subscribed flag -- no email, no full last name, no user id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_influencer_referred_users(
  p_code text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_promo_code RECORD;
  v_password_ok boolean;
  v_users json;
BEGIN
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(p_code)
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL OR v_promo_code.password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_promo_code.password_hash LIKE '$2%' THEN
    v_password_ok := (crypt(p_password, v_promo_code.password_hash) = v_promo_code.password_hash);
  ELSE
    v_password_ok := (v_promo_code.password_hash = p_password);
  END IF;

  IF NOT v_password_ok THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object(
      'first_name', COALESCE(p.first_name, 'User'),
      'last_initial', CASE WHEN p.last_name IS NOT NULL AND length(p.last_name) > 0
                            THEN left(p.last_name, 1) ELSE NULL END,
      'signup_date', r.created_at,
      'is_subscribed', EXISTS (
        SELECT 1 FROM public.user_subscriptions us
        WHERE us.user_id = r.user_id
          AND us.plan_name = 'premium'
          AND us.status IN ('active', 'cancelled')
          AND (us.expires_at IS NULL OR us.expires_at > NOW())
      )
    )
    ORDER BY r.created_at DESC
  ), '[]'::json) INTO v_users
  FROM public.referrals r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.promo_code_id = v_promo_code.id;

  RETURN json_build_object('success', true, 'referred_users', v_users);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_influencer_referred_users(text, text) TO authenticated, anon;
