-- Run this in the Supabase SQL Editor AFTER applying the migration.
-- It proves the fix is active without touching a real user's data.

-- 1) Confirm the trigger exists and is enabled.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.user_subscriptions'::regclass
  AND tgname = 'protect_subscription_entitlement_trigger';
-- Expect: one row, tgenabled = 'O' (origin/enabled)

-- 2) Simulate the exploit AS the Postgres role the client SDK actually uses
-- ("authenticated"), impersonating a real (non-admin) user, and try to grant
-- yourself premium the way an attacker would from the browser console.
-- Replace the UUID below with any real, non-admin user_id from your profiles table.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000'; -- replace with a real user id
SET LOCAL request.jwt.claim.role = 'authenticated';

UPDATE public.user_subscriptions
SET plan_name = 'premium', status = 'active', expires_at = '2099-01-01'
WHERE user_id = '00000000-0000-0000-0000-000000000000'; -- same id as above

-- Expected result: an ERROR — "Not permitted to self-grant a premium subscription"
-- If it succeeds instead, the trigger is NOT active yet.

RESET ROLE;
