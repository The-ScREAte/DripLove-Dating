-- Add function to check and dissolve expired matches
CREATE OR REPLACE FUNCTION check_and_dissolve_expired_matches()
RETURNS TABLE(dissolved_count INTEGER, notified_count INTEGER) AS $$
DECLARE
  v_dissolved_count INTEGER := 0;
  v_notified_count INTEGER := 0;
  expired_match RECORD;
BEGIN
  -- Find matches that are 10 days old with no messages
  FOR expired_match IN
    SELECT m.id, m.user1_id, m.user2_id, m.created_at
    FROM matches m
    LEFT JOIN chats c ON c.match_id = m.id
    WHERE m.created_at < NOW() - INTERVAL '10 days'
    AND c.id IS NULL  -- No messages sent
  LOOP
    -- Delete the expired match
    DELETE FROM matches WHERE id = expired_match.id;
    v_dissolved_count := v_dissolved_count + 1;
  END LOOP;

  -- Find matches expiring in 1 day (9 days old) with no messages
  FOR expired_match IN
    SELECT DISTINCT m.id, m.user1_id, m.user2_id, m.created_at,
           u1.first_name as user1_name,
           u2.first_name as user2_name
    FROM matches m
    LEFT JOIN chats c ON c.match_id = m.id
    JOIN profiles u1 ON u1.id = m.user1_id
    JOIN profiles u2 ON u2.id = m.user2_id
    WHERE m.created_at < NOW() - INTERVAL '9 days'
    AND m.created_at >= NOW() - INTERVAL '10 days'
    AND c.id IS NULL  -- No messages sent
    -- Check if notification hasn't been sent in the last day
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id IN (m.user1_id, m.user2_id)
      AND n.type = 'match_expiring'
      AND n.created_at > NOW() - INTERVAL '1 day'
      AND n.related_user_id IN (m.user1_id, m.user2_id)
    )
  LOOP
    -- Send notification to both users
    INSERT INTO notifications (user_id, title, message, type, related_user_id, is_read)
    VALUES 
      (
        expired_match.user1_id,
        'Match Expiring Soon!',
        'Your match with ' || expired_match.user2_name || ' expires in 1 day. Start chatting now!',
        'match_expiring',
        expired_match.user2_id,
        false
      ),
      (
        expired_match.user2_id,
        'Match Expiring Soon!',
        'Your match with ' || expired_match.user1_name || ' expires in 1 day. Start chatting now!',
        'match_expiring',
        expired_match.user1_id,
        false
      );
    
    v_notified_count := v_notified_count + 2;
  END LOOP;

  RETURN QUERY SELECT v_dissolved_count, v_notified_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a cron job to run this function daily (if pg_cron is available)
-- This would typically be set up separately in Supabase dashboard
-- SELECT cron.schedule('dissolve-expired-matches', '0 0 * * *', 'SELECT check_and_dissolve_expired_matches()');
