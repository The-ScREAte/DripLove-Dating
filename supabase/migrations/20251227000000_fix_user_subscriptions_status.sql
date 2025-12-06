-- Clean up any invalid status values in user_subscriptions table
-- This migration ensures all status values comply with the constraint

-- First, update any invalid status values to 'inactive'
UPDATE user_subscriptions
SET status = 'inactive'
WHERE status NOT IN ('active', 'inactive', 'cancelled', 'expired', 'paused');

-- Ensure the constraint exists with all valid values
ALTER TABLE user_subscriptions 
DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;

ALTER TABLE user_subscriptions 
ADD CONSTRAINT user_subscriptions_status_check 
CHECK (status IN ('active', 'inactive', 'cancelled', 'expired', 'paused'));
