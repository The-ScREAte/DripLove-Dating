-- Add moderation fields to user_images table
ALTER TABLE user_images 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS moderation_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);

-- Create index for moderation queries
CREATE INDEX IF NOT EXISTS idx_user_images_is_approved ON user_images(is_approved);
CREATE INDEX IF NOT EXISTS idx_user_images_moderation_status ON user_images(moderation_status);

-- Add comments for documentation
COMMENT ON COLUMN user_images.is_approved IS 'Whether the image is approved for public viewing';
COMMENT ON COLUMN user_images.moderation_status IS 'Status: pending, approved, rejected';
COMMENT ON COLUMN user_images.moderation_notes IS 'Admin notes for moderation decisions';
COMMENT ON COLUMN user_images.reviewed_at IS 'Timestamp when reviewed by admin';
COMMENT ON COLUMN user_images.reviewed_by IS 'Admin who reviewed the image';
