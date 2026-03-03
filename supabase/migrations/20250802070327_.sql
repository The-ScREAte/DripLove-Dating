-- Fix admin delete permissions for user_images table
-- This allows admins to delete reported/inappropriate images

-- Add admin delete policy for user_images
CREATE POLICY "Admins can delete any user image" 
ON public.user_images 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Verify the policies
SELECT schemaname, tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE tablename = 'user_images' 
ORDER BY policyname;;
