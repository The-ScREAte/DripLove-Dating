-- Removes the unused match-expiration feature. check_and_dissolve_expired_matches()
-- was added in 20251112000000_add_match_expiration.sql with its cron.schedule
-- call deliberately left commented out, and was never wired up from anywhere
-- else in the codebase either. It has never run in production. Deleting it
-- rather than leaving it around, per product decision.

DROP FUNCTION IF EXISTS public.check_and_dissolve_expired_matches();
