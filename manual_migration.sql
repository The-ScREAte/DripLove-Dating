-- Manually add moderation columns to user_images table
-- This ensures the columns exist for testing

DO $$ 
BEGIN
    -- Add is_approved column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_images' AND column_name = 'is_approved') THEN
        ALTER TABLE user_images ADD COLUMN is_approved BOOLEAN DEFAULT true;
    END IF;

    -- Add moderation_status column if it doesn't exist  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_images' AND column_name = 'moderation_status') THEN
        ALTER TABLE user_images ADD COLUMN moderation_status VARCHAR(20) DEFAULT 'approved';
    END IF;

    -- Add moderation_notes column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_images' AND column_name = 'moderation_notes') THEN
        ALTER TABLE user_images ADD COLUMN moderation_notes TEXT;
    END IF;

    -- Add reviewed_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_images' AND column_name = 'reviewed_at') THEN
        ALTER TABLE user_images ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add reviewed_by column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_images' AND column_name = 'reviewed_by') THEN
        ALTER TABLE user_images ADD COLUMN reviewed_by UUID;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_user_images_is_approved ON user_images(is_approved);
CREATE INDEX IF NOT EXISTS idx_user_images_moderation_status ON user_images(moderation_status);

-- Add comments for documentation
COMMENT ON COLUMN user_images.is_approved IS 'Whether the image is approved for public viewing';
COMMENT ON COLUMN user_images.moderation_status IS 'Status: pending, approved, rejected';
COMMENT ON COLUMN user_images.moderation_notes IS 'Admin notes for moderation decisions';
COMMENT ON COLUMN user_images.reviewed_at IS 'Timestamp when reviewed by admin';
COMMENT ON COLUMN user_images.reviewed_by IS 'Admin who reviewed the image';
