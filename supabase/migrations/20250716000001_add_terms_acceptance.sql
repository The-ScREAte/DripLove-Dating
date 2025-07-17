-- Add terms acceptance fields to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS terms_accepted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp with time zone DEFAULT null;
