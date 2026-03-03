-- Fix search path for the distance function - drop trigger first
DROP TRIGGER IF EXISTS set_default_distance_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.set_default_distance();

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

-- Recreate the trigger
CREATE TRIGGER set_default_distance_trigger
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_default_distance();;
