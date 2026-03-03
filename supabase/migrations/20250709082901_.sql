-- Update the handle_new_user function to ensure all registration fields are properly saved
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, first_name, last_name, email, date_of_birth, country, gender, preference,
    interests, account_status
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email,
    (NEW.raw_user_meta_data->>'date_of_birth')::date,
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'preference',
    '{}',
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;;
