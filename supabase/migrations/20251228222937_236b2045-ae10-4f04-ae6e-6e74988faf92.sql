-- Fix existing unread counts based on actual unread messages
-- Since we can't SELECT and UPDATE atomically via migration, use a CTE workaround

WITH unread_calc AS (
  SELECT 
    m.id as match_id,
    m.user1_id,
    m.user2_id,
    COALESCE(SUM(CASE WHEN c.sender_id = m.user2_id AND c.is_read = false THEN 1 ELSE 0 END), 0)::integer as user1_unread,
    COALESCE(SUM(CASE WHEN c.sender_id = m.user1_id AND c.is_read = false THEN 1 ELSE 0 END), 0)::integer as user2_unread
  FROM public.matches m
  LEFT JOIN public.chats c ON c.match_id = m.id
  GROUP BY m.id, m.user1_id, m.user2_id
)
UPDATE public.matches m
SET 
  user1_unread_count = uc.user1_unread,
  user2_unread_count = uc.user2_unread
FROM unread_calc uc
WHERE m.id = uc.match_id;