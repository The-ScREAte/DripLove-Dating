-- Create push_tokens table for storing device tokens
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON push_tokens(platform);

-- Add RLS policies
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own tokens
CREATE POLICY "Users can manage their own push tokens" ON push_tokens
    FOR ALL USING (auth.uid() = user_id);

-- Admins can view all tokens (for sending notifications)
CREATE POLICY "Admins can view all push tokens" ON push_tokens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    );

-- Add comments for documentation
COMMENT ON TABLE push_tokens IS 'Stores device tokens for push notifications';
COMMENT ON COLUMN push_tokens.token IS 'Device-specific push notification token';
COMMENT ON COLUMN push_tokens.platform IS 'Platform: ios, android, or web';
COMMENT ON COLUMN push_tokens.user_id IS 'User who owns this device token';
