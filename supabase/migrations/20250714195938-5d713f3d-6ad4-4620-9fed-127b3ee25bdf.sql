-- Create push tokens table for storing device tokens
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Enable Row Level Security
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for push tokens
CREATE POLICY "Users can insert their own push tokens" 
ON public.push_tokens 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens" 
ON public.push_tokens 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own push tokens" 
ON public.push_tokens 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all push tokens" 
ON public.push_tokens 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_admin = TRUE
));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_push_tokens_updated_at
BEFORE UPDATE ON public.push_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_push_tokens_updated_at();