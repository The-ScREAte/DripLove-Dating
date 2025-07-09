-- Make optional profile fields nullable for registration
ALTER TABLE public.profiles 
ALTER COLUMN city DROP NOT NULL,
ALTER COLUMN bio DROP NOT NULL,
ALTER COLUMN zip_code DROP NOT NULL,
ALTER COLUMN relationship_intent DROP NOT NULL,
ALTER COLUMN smoking DROP NOT NULL,
ALTER COLUMN drinking DROP NOT NULL,
ALTER COLUMN exercise_level DROP NOT NULL,
ALTER COLUMN sleeping_schedule DROP NOT NULL,
ALTER COLUMN occupation DROP NOT NULL,
ALTER COLUMN industry DROP NOT NULL,
ALTER COLUMN education_level DROP NOT NULL,
ALTER COLUMN fun_fact DROP NOT NULL,
ALTER COLUMN perfect_first_date DROP NOT NULL,
ALTER COLUMN last_googled DROP NOT NULL;