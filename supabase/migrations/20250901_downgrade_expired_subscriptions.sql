-- Supabase SQL: Downgrade expired subscriptions
-- This script should be run on a schedule (e.g., daily) to downgrade users whose premium period has ended.

update user_subscriptions
set plan_name = 'free', status = 'expired'
where status = 'canceled'
  and expires_at is not null
  and expires_at < now();
