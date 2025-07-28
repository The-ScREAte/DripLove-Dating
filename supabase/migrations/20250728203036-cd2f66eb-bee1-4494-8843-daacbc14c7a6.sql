-- Add enabled_countries column to payment_config table
ALTER TABLE payment_config 
ADD COLUMN IF NOT EXISTS enabled_countries jsonb DEFAULT '[]'::jsonb;

-- Create get_admin_stats function
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS json AS $$
BEGIN
  RETURN json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'active_users', (SELECT COUNT(*) FROM profiles WHERE account_status = 'active'),
    'total_matches', (SELECT COUNT(*) FROM matches),
    'pending_images', (SELECT COUNT(*) FROM user_images WHERE moderation_status = 'pending')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;