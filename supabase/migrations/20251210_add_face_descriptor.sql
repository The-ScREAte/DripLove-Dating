-- Add face_descriptor column to profiles table for face verification
-- This stores a hash of the user's face descriptor to prevent duplicate accounts
-- and verify that uploaded photos match the verified face
-- 
-- IMPORTANT: At least 1 uploaded photo must match the verified face (threshold: 0.6)
-- Face descriptors are 128-dimensional vectors encoded as base64 strings

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS face_descriptor TEXT;

-- Add unique index for duplicate prevention
-- This ensures one face = one account
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_face_descriptor_unique
ON profiles(face_descriptor) 
WHERE face_descriptor IS NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN profiles.face_descriptor IS 'Base64-encoded face descriptor hash (128D vector) for identity verification and duplicate account prevention. At least one uploaded photo must match this verified face.';
