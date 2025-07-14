-- Apply the location matching migration that adds missing columns
-- Add location-based matching fields to profiles table

-- Add new location columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_custom_city BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_distance INTEGER DEFAULT 50;

-- Update existing city column to be more flexible
ALTER TABLE profiles ALTER COLUMN city TYPE VARCHAR(100);

-- Add indexes for efficient location-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(country_code, city);
CREATE INDEX IF NOT EXISTS idx_profiles_coordinates ON profiles(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country_code);

-- Add constraint to ensure valid coordinates
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_latitude 
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_longitude 
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- Add constraint for max_distance (1-500 km)
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_max_distance 
    CHECK (max_distance > 0 AND max_distance <= 500);

-- Update the profiles table to include location preferences
COMMENT ON COLUMN profiles.country_code IS 'ISO 3166-1 alpha-2 country code (e.g., NG, GH, KE)';
COMMENT ON COLUMN profiles.latitude IS 'Decimal latitude for location-based matching';
COMMENT ON COLUMN profiles.longitude IS 'Decimal longitude for location-based matching';
COMMENT ON COLUMN profiles.is_custom_city IS 'True if city is not in our predefined list';
COMMENT ON COLUMN profiles.max_distance IS 'Maximum distance in kilometers for potential matches';

-- Create function to calculate distance between two points (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DECIMAL, lon1 DECIMAL, 
    lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
    RETURN (
        6371 * acos(
            cos(radians(lat1)) * 
            cos(radians(lat2)) * 
            cos(radians(lon2) - radians(lon1)) + 
            sin(radians(lat1)) * 
            sin(radians(lat2))
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create view for location-based matching
CREATE OR REPLACE VIEW profile_locations AS
SELECT 
    id,
    first_name,
    age,
    city,
    country_code,
    latitude,
    longitude,
    max_distance,
    is_custom_city,
    created_at
FROM profiles
WHERE 
    country_code IS NOT NULL 
    AND city IS NOT NULL 
    AND city != '';

-- Create function to find potential matches within distance
CREATE OR REPLACE FUNCTION find_matches_by_location(
    user_id UUID,
    max_distance_km INTEGER DEFAULT NULL
) RETURNS TABLE (
    profile_id UUID,
    distance_km DECIMAL,
    city VARCHAR,
    country_code VARCHAR
) AS $$
DECLARE
    user_lat DECIMAL;
    user_lon DECIMAL;
    user_max_dist INTEGER;
    search_distance INTEGER;
BEGIN
    -- Get user's location and preferences
    SELECT latitude, longitude, max_distance 
    INTO user_lat, user_lon, user_max_dist
    FROM profiles 
    WHERE id = user_id;
    
    -- Use provided distance or user's preference
    search_distance := COALESCE(max_distance_km, user_max_dist, 50);
    
    -- Return matches within distance (if coordinates available)
    IF user_lat IS NOT NULL AND user_lon IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            p.id,
            calculate_distance(user_lat, user_lon, p.latitude, p.longitude) as distance_km,
            p.city,
            p.country_code
        FROM profiles p
        WHERE 
            p.id != user_id
            AND p.latitude IS NOT NULL 
            AND p.longitude IS NOT NULL
            AND calculate_distance(user_lat, user_lon, p.latitude, p.longitude) <= search_distance
        ORDER BY distance_km;
    ELSE
        -- Fallback to city/country matching if no coordinates
        RETURN QUERY
        SELECT 
            p.id,
            999.0 as distance_km, -- Placeholder distance
            p.city,
            p.country_code
        FROM profiles p
        WHERE 
            p.id != user_id
            AND p.country_code = (SELECT country_code FROM profiles WHERE id = user_id)
        ORDER BY 
            CASE WHEN p.city = (SELECT city FROM profiles WHERE id = user_id) THEN 1 ELSE 2 END,
            p.created_at DESC;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT ON profile_locations TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_distance TO authenticated;
GRANT EXECUTE ON FUNCTION find_matches_by_location TO authenticated;