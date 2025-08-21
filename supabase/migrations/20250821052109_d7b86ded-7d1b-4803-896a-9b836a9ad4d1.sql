-- Fix search path for the distance function
DROP FUNCTION public.set_default_distance();

CREATE OR REPLACE FUNCTION public.set_default_distance()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.max_distance IS NULL THEN
    NEW.max_distance = 50;
  END IF;
  RETURN NEW;
END;
$$;