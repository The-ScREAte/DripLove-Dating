-- Update the handle_new_user function to include all the new registration fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, first_name, last_name, email, date_of_birth, country, city, zip_code,
    gender, preference, relationship_intent, occupation, industry, education_level,
    interests, account_status
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email,
    (NEW.raw_user_meta_data->>'date_of_birth')::date,
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'zip_code',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'preference',
    NEW.raw_user_meta_data->>'relationship_intent',
    NEW.raw_user_meta_data->>'occupation',
    NEW.raw_user_meta_data->>'industry',
    NEW.raw_user_meta_data->>'education_level',
    '{}',
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;;
