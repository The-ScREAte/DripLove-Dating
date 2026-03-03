
-- Add distance_preference column to profiles table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'distance_preference') THEN
        ALTER TABLE public.profiles 
        ADD COLUMN distance_preference INTEGER DEFAULT 25 CHECK (distance_preference >= 1 AND distance_preference <= 100);
    END IF;
END $$;

-- Storage policies for user images (drop existing ones first if they exist)
DROP POLICY IF EXISTS "Users can upload their own images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view user images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

-- Create storage policies for user images
CREATE POLICY "Users can upload their own images" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'user-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view user images" ON storage.objects 
FOR SELECT USING (bucket_id = 'user-images');

CREATE POLICY "Users can update their own images" ON storage.objects 
FOR UPDATE USING (
  bucket_id = 'user-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own images" ON storage.objects 
FOR DELETE USING (
  bucket_id = 'user-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);
;
