-- Set default max_distance for users who don't have one
UPDATE public.profiles 
SET max_distance = 50 
WHERE max_distance IS NULL OR max_distance = 0;

-- Create function to set default distance on profile creation
CREATE OR REPLACE FUNCTION public.set_default_distance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.max_distance IS NULL THEN
    NEW.max_distance = 50;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set default distance on insert
CREATE TRIGGER set_default_distance_trigger
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_default_distance();;
