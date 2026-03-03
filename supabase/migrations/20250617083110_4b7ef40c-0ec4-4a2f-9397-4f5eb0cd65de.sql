
-- Add gender and all the new fields to the profiles table
ALTER TABLE public.profiles 
ADD COLUMN gender TEXT CHECK (gender IN ('man', 'woman', 'non-binary', 'other')),
ADD COLUMN relationship_intent TEXT CHECK (relationship_intent IN ('long-term', 'friendship', 'casual', 'marriage', 'exploring')),
ADD COLUMN smoking TEXT CHECK (smoking IN ('yes', 'no', 'occasionally')),
ADD COLUMN drinking TEXT CHECK (drinking IN ('yes', 'no', 'socially')),
ADD COLUMN exercise_level TEXT CHECK (exercise_level IN ('active', 'sometimes', 'rarely')),
ADD COLUMN sleeping_schedule TEXT CHECK (sleeping_schedule IN ('early-riser', 'night-owl')),
ADD COLUMN occupation TEXT,
ADD COLUMN industry TEXT,
ADD COLUMN education_level TEXT CHECK (education_level IN ('high-school', 'some-college', 'bachelors', 'masters', 'phd', 'trade-school', 'other')),
ADD COLUMN zip_code TEXT,
ADD COLUMN introvert_extrovert INTEGER CHECK (introvert_extrovert >= 1 AND introvert_extrovert <= 5),
ADD COLUMN spontaneous_planner INTEGER CHECK (spontaneous_planner >= 1 AND spontaneous_planner <= 5),
ADD COLUMN messy_organized INTEGER CHECK (messy_organized >= 1 AND messy_organized <= 5),
ADD COLUMN fun_fact TEXT,
ADD COLUMN perfect_first_date TEXT,
ADD COLUMN last_googled TEXT;

-- Update the trigger function to handle all the new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, first_name, last_name, email, date_of_birth, country, city, bio, preference, interests,
    gender, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule,
    occupation, industry, education_level, zip_code,
    introvert_extrovert, spontaneous_planner, messy_organized,
    fun_fact, perfect_first_date, last_googled
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email,
    (NEW.raw_user_meta_data->>'date_of_birth')::date,
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'bio',
    NEW.raw_user_meta_data->>'preference',
    CASE 
      WHEN NEW.raw_user_meta_data->'interests' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'interests'))
      ELSE '{}'::text[]
    END,
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'relationship_intent',
    NEW.raw_user_meta_data->>'smoking',
    NEW.raw_user_meta_data->>'drinking',
    NEW.raw_user_meta_data->>'exercise_level',
    NEW.raw_user_meta_data->>'sleeping_schedule',
    NEW.raw_user_meta_data->>'occupation',
    NEW.raw_user_meta_data->>'industry',
    NEW.raw_user_meta_data->>'education_level',
    NEW.raw_user_meta_data->>'zip_code',
    CASE 
      WHEN NEW.raw_user_meta_data->>'introvert_extrovert' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'introvert_extrovert')::integer
      ELSE NULL
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->>'spontaneous_planner' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'spontaneous_planner')::integer
      ELSE NULL
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->>'messy_organized' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'messy_organized')::integer
      ELSE NULL
    END,
    NEW.raw_user_meta_data->>'fun_fact',
    NEW.raw_user_meta_data->>'perfect_first_date',
    NEW.raw_user_meta_data->>'last_googled'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
