-- Add face_descriptor column to profiles table for face verification
-- This stores a hash of the user's face descriptor to prevent duplicate accounts
-- and verify that uploaded photos match the verified face

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS face_descriptor TEXT;

-- Add index for faster duplicate checks
CREATE INDEX IF NOT EXISTS idx_profiles_face_descriptor 
ON profiles(face_descriptor) 
WHERE face_descriptor IS NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN profiles.face_descriptor IS 'Base64-encoded face descriptor hash for identity verification and duplicate account prevention';
