-- Add missing trigger to automatically create profiles when users are created
-- This trigger will call handle_new_user() function when a new user is inserted into auth.users

-- First, ensure the handle_new_user function exists and is up to date
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, 
    first_name, 
    last_name, 
    email, 
    date_of_birth, 
    country, 
    city, 
    zip_code,
    gender, 
    preference, 
    relationship_intent, 
    occupation, 
    industry, 
    education_level,
    bio,
    interests, 
    country_code,
    latitude,
    longitude,
    max_distance,
    account_status
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email,
    CASE 
      WHEN NEW.raw_user_meta_data->>'date_of_birth' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'date_of_birth')::date
      ELSE NULL
    END,
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'zip_code',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'preference',
    NEW.raw_user_meta_data->>'relationship_intent',
    NEW.raw_user_meta_data->>'occupation',
    NEW.raw_user_meta_data->>'industry',
    NEW.raw_user_meta_data->>'education_level',
    NEW.raw_user_meta_data->>'bio',
    CASE 
      WHEN NEW.raw_user_meta_data->'interests' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'interests'))
      ELSE '{}'::text[]
    END,
    NEW.raw_user_meta_data->>'country_code',
    CASE 
      WHEN NEW.raw_user_meta_data->>'latitude' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'latitude')::decimal
      ELSE NULL
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->>'longitude' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'longitude')::decimal
      ELSE NULL
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->>'max_distance' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'max_distance')::integer
      ELSE 50
    END,
    'active'
  );
  RETURN NEW;
END;
$function$;

-- Create the missing trigger on auth.users
-- This trigger will automatically create a profile when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;