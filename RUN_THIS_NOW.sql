-- RUN THIS IN SUPABASE SQL EDITOR RIGHT NOW
-- It will force expire stale subscriptions and show you the real numbers

-- 1. Force expire all stale subscriptions
SELECT handle_subscription_expiry();

-- 2. Show Premium Now count (what Platform Stats should show)
SELECT COUNT(DISTINCT us.user_id) as premium_now_count
FROM user_subscriptions us
JOIN profiles p ON p.id = us.user_id
WHERE p.is_admin = false
  AND us.plan_name = 'premium'
  AND us.status = 'active'
  AND (us.expires_at IS NULL OR us.expires_at > NOW());

-- 3. Show how many stale subscriptions exist (should be 0)
SELECT COUNT(*) as stale_count,
       'These users have expired but still marked active' as description
FROM user_subscriptions
WHERE plan_name = 'premium'
  AND status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at <= NOW();

-- 4. Show breakdown of all premium subscription statuses
SELECT 
  status,
  plan_name,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM user_subscriptions
WHERE plan_name IN ('premium', 'free')
  OR status IN ('active', 'cancelled', 'canceled', 'expired', 'payment_failed')
GROUP BY status, plan_name
ORDER BY 
  CASE plan_name 
    WHEN 'premium' THEN 1 
    WHEN 'free' THEN 2 
    ELSE 3 
  END,
  CASE status
    WHEN 'active' THEN 1
    WHEN 'cancelled' THEN 2
    WHEN 'canceled' THEN 3
    WHEN 'expired' THEN 4
    WHEN 'payment_failed' THEN 5
    ELSE 6
  END;

-- 5. List the actual premium users (for verification)
SELECT 
  p.id,
  p.first_name,
  p.last_name,
  p.email,
  us.status,
  us.plan_name,
  us.payment_method,
  us.expires_at,
  CASE 
    WHEN us.expires_at IS NULL THEN 'Never expires'
    WHEN us.expires_at > NOW() THEN 'Valid (' || EXTRACT(DAY FROM (us.expires_at - NOW())) || ' days left)'
    ELSE 'EXPIRED (' || EXTRACT(DAY FROM (NOW() - us.expires_at)) || ' days ago)'
  END as expiry_status
FROM profiles p
JOIN user_subscriptions us ON us.user_id = p.id
WHERE p.is_admin = false
  AND us.plan_name = 'premium'
  AND us.status = 'active'
ORDER BY us.expires_at DESC NULLS FIRST;
