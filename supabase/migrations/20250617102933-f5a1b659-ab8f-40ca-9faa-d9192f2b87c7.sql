
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  type TEXT NOT NULL, -- 'message', 'match', 'like'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view their own notifications" 
  ON public.notifications 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications" 
  ON public.notifications 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- System can insert notifications for users
CREATE POLICY "System can insert notifications" 
  ON public.notifications 
  FOR INSERT 
  WITH CHECK (true);

-- Create function to create notification when new message is sent
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receiver_id UUID;
  sender_name TEXT;
BEGIN
  -- Get the receiver (the other user in the match)
  SELECT CASE 
    WHEN m.user1_id = NEW.sender_id THEN m.user2_id 
    ELSE m.user1_id 
  END INTO receiver_id
  FROM matches m 
  WHERE m.id = NEW.match_id;
  
  -- Get sender name
  SELECT CONCAT(first_name, ' ', last_name) INTO sender_name
  FROM profiles 
  WHERE id = NEW.sender_id;
  
  -- Create notification for receiver
  INSERT INTO notifications (user_id, type, title, message, related_user_id)
  VALUES (
    receiver_id, 
    'message', 
    'New Message', 
    sender_name || ' sent you a message',
    NEW.sender_id
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for message notifications
CREATE TRIGGER on_new_message_notification
  AFTER INSERT ON chats
  FOR EACH ROW EXECUTE FUNCTION create_message_notification();

-- Create function to auto-delete old messages (36 hours)
CREATE OR REPLACE FUNCTION delete_old_messages()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM chats 
  WHERE created_at < NOW() - INTERVAL '36 hours';
END;
$$;

-- Add admin role to profiles (for admin users)
ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;

-- Create admin policies for full access
CREATE POLICY "Admins can view all profiles" 
  ON public.profiles 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can view all matches" 
  ON public.matches 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can view all likes" 
  ON public.likes 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can view all blocks" 
  ON public.blocks 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can view all chats" 
  ON public.chats 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Create function to get app statistics
CREATE OR REPLACE FUNCTION get_app_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'total_matches', (SELECT COUNT(*) FROM matches),
    'total_likes', (SELECT COUNT(*) FROM likes),
    'total_blocks', (SELECT COUNT(*) FROM blocks),
    'total_messages', (SELECT COUNT(*) FROM chats),
    'active_users_today', (
      SELECT COUNT(DISTINCT sender_id) 
      FROM chats 
      WHERE created_at >= CURRENT_DATE
    ),
    'new_users_this_week', (
      SELECT COUNT(*) 
      FROM profiles 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'matches_this_week', (
      SELECT COUNT(*) 
      FROM matches 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    )
  ) INTO result;
  
  RETURN result;
END;
$$;
