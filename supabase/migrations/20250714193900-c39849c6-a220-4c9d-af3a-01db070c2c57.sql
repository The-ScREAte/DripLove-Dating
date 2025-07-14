-- Fix the reject_image function to actually delete the image instead of just marking it as rejected
CREATE OR REPLACE FUNCTION public.reject_image(image_id uuid, admin_notes text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Delete the image completely instead of just marking as rejected
  DELETE FROM user_images 
  WHERE id = image_id;
  
  RETURN true;
END;
$function$;