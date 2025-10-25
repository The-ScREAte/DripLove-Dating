-- Create redirects table
CREATE TABLE IF NOT EXISTS public.redirects (
  id TEXT PRIMARY KEY,
  ios_url TEXT,
  android_url TEXT,
  web_url TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  clicks INTEGER DEFAULT 0,
  last_clicked_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.redirects ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage redirects"
ON public.redirects
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Anyone can read redirects (needed for public redirect page)
CREATE POLICY "Anyone can read redirects"
ON public.redirects
FOR SELECT
USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_redirects_id ON public.redirects(id);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_redirects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_redirects_timestamp
BEFORE UPDATE ON public.redirects
FOR EACH ROW
EXECUTE FUNCTION update_redirects_updated_at();

-- Create RPC function for fast click increment
CREATE OR REPLACE FUNCTION increment_redirect_clicks(redirect_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.redirects
  SET clicks = clicks + 1,
      last_clicked_at = NOW()
  WHERE id = redirect_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
