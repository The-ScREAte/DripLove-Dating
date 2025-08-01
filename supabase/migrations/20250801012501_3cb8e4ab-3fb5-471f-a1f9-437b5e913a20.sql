-- Create reported_images table to store image reports
CREATE TABLE IF NOT EXISTS public.reported_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id),
  reported_user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on reported_images table
ALTER TABLE public.reported_images ENABLE ROW LEVEL SECURITY;

-- Create policies for reported_images
CREATE POLICY "Users can create reports"
ON public.reported_images
FOR INSERT
WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports"
ON public.reported_images
FOR SELECT
USING (auth.uid() = reporter_id);

CREATE POLICY "Admins can view all reports"
ON public.reported_images
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_admin = true
));

-- Add indexes for better performance
CREATE INDEX idx_reported_images_status ON public.reported_images(status);
CREATE INDEX idx_reported_images_reported_user ON public.reported_images(reported_user_id);
CREATE INDEX idx_reported_images_reporter ON public.reported_images(reporter_id);