-- Fix push_tokens table constraint for upsert
-- This adds a unique constraint on (user_id, token) combination

-- First, remove any duplicate rows (keep the most recent)
DELETE FROM push_tokens a USING push_tokens b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.token = b.token;

-- Add the unique constraint
ALTER TABLE push_tokens 
ADD CONSTRAINT push_tokens_user_token_unique 
UNIQUE (user_id, token);

-- Also add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
