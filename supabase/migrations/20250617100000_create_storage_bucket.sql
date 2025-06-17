
-- Create storage bucket for user images
INSERT INTO storage.buckets (id, name, public)
VALUES ('loveconnect', 'loveconnect', true);

-- Create policy to allow users to upload their own images
CREATE POLICY "Users can upload their own images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'loveconnect' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create policy to allow users to view all images (for discover functionality)
CREATE POLICY "Anyone can view images" ON storage.objects
  FOR SELECT USING (bucket_id = 'loveconnect');

-- Create policy to allow users to delete their own images
CREATE POLICY "Users can delete their own images" ON storage.objects
  FOR DELETE USING (bucket_id = 'loveconnect' AND auth.uid()::text = (storage.foldername(name))[1]);
