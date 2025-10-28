-- Find duplicate user IDs in profiles table
SELECT 
  id,
  COUNT(*) as count,
  STRING_AGG(first_name || ' ' || last_name, ', ') as names,
  STRING_AGG(email, ', ') as emails
FROM profiles
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Also check if there are any NULL or invalid IDs
SELECT 
  id,
  first_name,
  last_name,
  email,
  created_at
FROM profiles
WHERE id IS NULL OR id = '00000000-0000-0000-0000-000000000000'
ORDER BY created_at DESC;
