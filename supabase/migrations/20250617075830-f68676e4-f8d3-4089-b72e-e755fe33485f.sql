
-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  bio TEXT,
  preference TEXT NOT NULL CHECK (preference IN ('men', 'women', 'both')),
  interests TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

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

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, date_of_birth, country, city, bio, preference, interests)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email,
    (NEW.raw_user_meta_data->>'date_of_birth')::date,
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'bio',
    NEW.raw_user_meta_data->>'preference',
    COALESCE((NEW.raw_user_meta_data->>'interests')::text[], '{}')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
