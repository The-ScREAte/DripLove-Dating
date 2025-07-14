-- Create user images table (max 7 images per user)
CREATE TABLE public.user_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_order INTEGER NOT NULL CHECK (image_order >= 1 AND image_order <= 7),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, image_order)
);

-- Enable Row Level Security
ALTER TABLE public.user_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user images
CREATE POLICY "Users can view all user images" ON public.user_images FOR SELECT USING (true);
CREATE POLICY "Users can insert their own images" ON public.user_images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own images" ON public.user_images FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own images" ON public.user_images FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for user images
INSERT INTO storage.buckets (id, name, public) VALUES ('user-images', 'user-images', true);

-- Storage policies for user images
CREATE POLICY "Users can upload their own images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'user-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view user images" ON storage.objects FOR SELECT USING (bucket_id = 'user-images');

CREATE POLICY "Users can update their own images" ON storage.objects FOR UPDATE USING (
  bucket_id = 'user-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own images" ON storage.objects FOR DELETE USING (
  bucket_id = 'user-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);
