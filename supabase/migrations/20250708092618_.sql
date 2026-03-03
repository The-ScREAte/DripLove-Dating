-- Create payment_config table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.payment_config (
  id uuid primary key default gen_random_uuid(),
  payment_methods jsonb not null default '[]'::jsonb,
  premium_price numeric(10,2) not null default 50.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only allow one row (singleton config)
CREATE UNIQUE INDEX IF NOT EXISTS only_one_payment_config ON public.payment_config((true));

-- Enable RLS
ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view payment config" 
ON public.payment_config 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_admin = true
));

CREATE POLICY "Admins can insert payment config" 
ON public.payment_config 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_admin = true
));

CREATE POLICY "Admins can update payment config" 
ON public.payment_config 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_admin = true
));

-- Insert default config if table is empty
INSERT INTO public.payment_config (id, payment_methods, premium_price)
VALUES ('00000000-0000-0000-0000-000000000000', '[]'::jsonb, 50.00)
ON CONFLICT (id) DO NOTHING;;
