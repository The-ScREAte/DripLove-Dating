-- Fix the confidence_score column precision issue
ALTER TABLE user_images ALTER COLUMN confidence_score TYPE NUMERIC(5,2);;
