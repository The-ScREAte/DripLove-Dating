-- Add reply_to column to chats table to support threaded replies
ALTER TABLE chats ADD COLUMN reply_to uuid REFERENCES chats(id) ON DELETE SET NULL;

-- Add index for better performance when querying replies
CREATE INDEX idx_chats_reply_to ON chats(reply_to);