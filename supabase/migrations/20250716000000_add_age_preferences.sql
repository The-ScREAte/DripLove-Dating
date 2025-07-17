-- Add age preference fields to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS min_age INTEGER DEFAULT 18,
ADD COLUMN IF NOT EXISTS max_age INTEGER DEFAULT 99;

-- Add comments for clarity
COMMENT ON COLUMN profiles.min_age IS 'Minimum age preference for matches';
COMMENT ON COLUMN profiles.max_age IS 'Maximum age preference for matches';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_min_age ON profiles(min_age);
CREATE INDEX IF NOT EXISTS idx_profiles_max_age ON profiles(max_age);
