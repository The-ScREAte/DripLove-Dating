-- Check if any users have push tokens
SELECT 
  pt.user_id,
  p.first_name,
  p.last_name,
  pt.platform,
  pt.created_at,
  LEFT(pt.token, 30) as token_preview
FROM push_tokens pt
LEFT JOIN profiles p ON p.id = pt.user_id
ORDER BY pt.created_at DESC
LIMIT 10;
