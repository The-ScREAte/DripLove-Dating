-- Add separate version columns for iOS and Android
ALTER TABLE app_update_config 
ADD COLUMN IF NOT EXISTS ios_version TEXT DEFAULT '1.0.0',
ADD COLUMN IF NOT EXISTS android_version TEXT DEFAULT '1.0.0';

-- Migrate existing current_version to both columns
UPDATE app_update_config 
SET ios_version = current_version, android_version = current_version 
WHERE ios_version IS NULL OR android_version IS NULL;