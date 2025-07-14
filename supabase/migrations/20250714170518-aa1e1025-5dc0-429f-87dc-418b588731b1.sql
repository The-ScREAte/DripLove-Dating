-- Add photo moderation columns to user_images table
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS moderation_notes TEXT;
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS moderated_by UUID;
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS flagged_content TEXT[];
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2);

-- Add index for efficient moderation queries
CREATE INDEX IF NOT EXISTS idx_user_images_moderation ON user_images(is_approved, moderation_status);
CREATE INDEX IF NOT EXISTS idx_user_images_pending ON user_images(moderation_status) WHERE moderation_status = 'pending';

-- Add constraints using DO blocks
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_moderated_by') THEN
        ALTER TABLE user_images ADD CONSTRAINT fk_moderated_by 
            FOREIGN KEY (moderated_by) REFERENCES profiles(id);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_moderation_status') THEN
        ALTER TABLE user_images ADD CONSTRAINT chk_moderation_status 
            CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged'));
    END IF;
END $$;

-- Update RLS policies for moderation
-- Users can only see approved images from others (but their own regardless of status)
DROP POLICY IF EXISTS "Users can view all user images" ON user_images;

CREATE POLICY "Users can view approved images or their own" 
ON user_images 
FOR SELECT 
TO authenticated
USING (
  is_approved = true OR 
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Create function to approve image
CREATE OR REPLACE FUNCTION approve_image(
  image_id UUID,
  admin_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update image status
  UPDATE user_images 
  SET 
    is_approved = true,
    moderation_status = 'approved',
    moderation_notes = admin_notes,
    moderated_by = auth.uid(),
    moderated_at = now()
  WHERE id = image_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to reject image
CREATE OR REPLACE FUNCTION reject_image(
  image_id UUID,
  admin_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update image status
  UPDATE user_images 
  SET 
    is_approved = false,
    moderation_status = 'rejected',
    moderation_notes = admin_notes,
    moderated_by = auth.uid(),
    moderated_at = now()
  WHERE id = image_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION approve_image TO authenticated;
GRANT EXECUTE ON FUNCTION reject_image TO authenticated;