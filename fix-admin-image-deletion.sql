-- Comprehensive fix for admin image deletion issues
-- This ensures admins can properly delete images from the admin panel

-- 1. Add admin delete policy for user_images
CREATE POLICY "Admins can delete any user image" 
ON public.user_images 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- 2. Ensure reject_image function works properly (already exists but let's verify)
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
  
  -- Delete the image completely (SECURITY DEFINER bypasses RLS)
  DELETE FROM user_images 
  WHERE id = image_id;
  
  RETURN true;
END;
$function$;

-- 3. Create a new function for deleting reported images that bypasses RLS
CREATE OR REPLACE FUNCTION public.delete_reported_image(
  image_url_param text,
  reported_user_id_param uuid DEFAULT NULL
)
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
  
  -- Delete images by URL and user_id if provided, or just by URL
  IF reported_user_id_param IS NOT NULL THEN
    DELETE FROM user_images 
    WHERE image_url = image_url_param AND user_id = reported_user_id_param;
  ELSE
    DELETE FROM user_images 
    WHERE image_url = image_url_param;
  END IF;
  
  -- Return true if any rows were affected
  RETURN FOUND;
END;
$function$;

-- 4. Verify all policies are in place
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  cmd, 
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'user_images' 
ORDER BY cmd, policyname;
