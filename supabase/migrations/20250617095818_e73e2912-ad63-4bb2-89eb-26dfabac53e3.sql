
-- Create a blocks table for blocking functionality
CREATE TABLE public.blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID REFERENCES auth.users NOT NULL,
  blocked_id UUID REFERENCES auth.users NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Add RLS policies for blocks table
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blocks" ON public.blocks
  FOR SELECT USING (auth.uid() = blocker_id);

CREATE POLICY "Users can create blocks" ON public.blocks
  FOR INSERT WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can delete their own blocks" ON public.blocks
  FOR DELETE USING (auth.uid() = blocker_id);

-- Enable realtime for chats table to make messaging faster
ALTER TABLE public.chats REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;

-- Add unread message count column to matches table
ALTER TABLE public.matches ADD COLUMN user1_unread_count INTEGER DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN user2_unread_count INTEGER DEFAULT 0;

-- Function to update unread counts when a message is sent
CREATE OR REPLACE FUNCTION public.update_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update unread count for the receiver
  UPDATE public.matches 
  SET 
    user1_unread_count = CASE 
      WHEN user1_id != NEW.sender_id THEN user1_unread_count + 1 
      ELSE user1_unread_count 
    END,
    user2_unread_count = CASE 
      WHEN user2_id != NEW.sender_id THEN user2_unread_count + 1 
      ELSE user2_unread_count 
    END
  WHERE id = NEW.match_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating unread counts
CREATE TRIGGER update_unread_count_trigger
  AFTER INSERT ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_unread_count();
;
