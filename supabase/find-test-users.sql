-- SQL Query to find valid user IDs for testing push notifications
-- Run this in Supabase SQL Editor to get real user IDs with push tokens

-- Get users who have push tokens registered
SELECT 
  pt.user_id,
  pt.token,
  pt.platform,
  pt.created_at,
  p.display_name,
  p.bio
FROM push_tokens pt
LEFT JOIN profiles p ON pt.user_id = p.id
WHERE pt.token IS NOT NULL
ORDER BY pt.created_at DESC
LIMIT 10;

-- Alternative: Just get user IDs (copy any of these for testing)
SELECT DISTINCT user_id 
FROM push_tokens 
WHERE token IS NOT NULL
LIMIT 5;

-- Count how many tokens are registered
SELECT 
  platform,
  COUNT(*) as token_count
FROM push_tokens
GROUP BY platform;
