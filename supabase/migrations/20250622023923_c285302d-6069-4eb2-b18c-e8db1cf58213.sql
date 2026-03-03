
-- Add missing columns to support chat functionality and like me cooldown

-- Add last_msg_at column to matches table to track when the last message was sent
ALTER TABLE public.matches ADD COLUMN last_msg_at TIMESTAMP WITH TIME ZONE;

-- Add is_read column to chats table to track message read status
ALTER TABLE public.chats ADD COLUMN is_read BOOLEAN DEFAULT false;

-- Add like_me_cooldown_until column to profiles table for like me feature cooldown
ALTER TABLE public.profiles ADD COLUMN like_me_cooldown_until TIMESTAMP WITH TIME ZONE;

-- Create or replace function to update last_msg_at when a message is sent
CREATE OR REPLACE FUNCTION public.update_last_message_time()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the last_msg_at timestamp in matches table
  UPDATE public.matches 
  SET last_msg_at = NEW.created_at
  WHERE id = NEW.match_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update last_msg_at when messages are inserted
DROP TRIGGER IF EXISTS update_last_message_time_trigger ON public.chats;
CREATE TRIGGER update_last_message_time_trigger
  AFTER INSERT ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_message_time();
;
