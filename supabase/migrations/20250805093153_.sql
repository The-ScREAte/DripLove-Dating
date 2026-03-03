-- Modify the handle_new_user function to be more defensive
-- Only create profile if we have essential data, otherwise skip
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Only create profile if we have date_of_birth (indicating full registration)
  -- Skip profile creation for email verification only signups
  IF NEW.raw_user_meta_data->>'date_of_birth' IS NOT NULL THEN
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
  END IF;
  
  RETURN NEW;
END;
$$;;
