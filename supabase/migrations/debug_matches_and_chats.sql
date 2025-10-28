-- Check if matches exist and their structure
SELECT 
  m.id,
  m.user1_id,
  m.user2_id,
  m.created_at,
  m.last_msg_at,
  m.user1_unread_count,
  m.user2_unread_count,
  u1.first_name || ' ' || u1.last_name as user1_name,
  u1.email as user1_email,
  u2.first_name || ' ' || u2.last_name as user2_name,
  u2.email as user2_email
FROM matches m
JOIN profiles u1 ON m.user1_id = u1.id
JOIN profiles u2 ON m.user2_id = u2.id
ORDER BY m.created_at DESC
LIMIT 20;

-- Check if there are any chats associated with matches
SELECT 
  m.id as match_id,
  u1.first_name || ' ' || u1.last_name as user1_name,
  u2.first_name || ' ' || u2.last_name as user2_name,
  COUNT(c.id) as message_count,
  MAX(c.created_at) as last_message_at
FROM matches m
JOIN profiles u1 ON m.user1_id = u1.id
JOIN profiles u2 ON m.user2_id = u2.id
LEFT JOIN chats c ON c.match_id = m.id
GROUP BY m.id, user1_name, user2_name
ORDER BY MAX(c.created_at) DESC NULLS LAST
LIMIT 20;
