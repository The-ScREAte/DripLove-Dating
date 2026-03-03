
-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile-photos', 'profile-photos', true);

-- Create policy to allow authenticated users to upload their own photos
CREATE POLICY "Allow authenticated users to upload photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos' 
    AND auth.role() = 'authenticated'
  );

-- Create policy to allow public access to view photos
CREATE POLICY "Allow public access to photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos');

-- Create policy to allow users to update their own photos
CREATE POLICY "Allow users to update own photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create policy to allow users to delete their own photos
CREATE POLICY "Allow users to delete own photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
;
