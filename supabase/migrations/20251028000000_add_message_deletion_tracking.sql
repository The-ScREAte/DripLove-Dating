-- Add deleted_for column to chats table to track message deletions
-- This allows for "delete for me" and "delete for everyone" functionality
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS deleted_for text[] DEFAULT '{}';

-- Add index for better query performance when filtering deleted messages
CREATE INDEX IF NOT EXISTS idx_chats_deleted_for ON public.chats USING gin(deleted_for);

-- Add comment explaining the column
COMMENT ON COLUMN public.chats.deleted_for IS 'Array of user IDs who have deleted this message for themselves. Empty array means visible to all, if both users are in array, message can be permanently deleted';
