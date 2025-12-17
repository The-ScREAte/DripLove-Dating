-- Create scheduled_broadcasts table
CREATE TABLE IF NOT EXISTS public.scheduled_broadcasts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_countries TEXT[], -- NULL means all countries
    repeat_type TEXT NOT NULL CHECK (repeat_type IN ('daily', 'every_2_days', 'weekends', 'weekdays', 'specific_day')),
    specific_day TEXT CHECK (specific_day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
    time_to_send TEXT NOT NULL, -- HH:MM format
    is_active BOOLEAN DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    next_send_at TIMESTAMPTZ,
    total_sends INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create index on is_active and next_send_at for efficient querying
CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_active_next_send 
ON public.scheduled_broadcasts(is_active, next_send_at) 
WHERE is_active = true;

-- Create index on admin_id
CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_admin_id 
ON public.scheduled_broadcasts(admin_id);

-- Enable Row Level Security
ALTER TABLE public.scheduled_broadcasts ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view scheduled broadcasts
CREATE POLICY "Admins can view scheduled broadcasts"
ON public.scheduled_broadcasts
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);

-- Policy: Only admins can insert scheduled broadcasts
CREATE POLICY "Admins can insert scheduled broadcasts"
ON public.scheduled_broadcasts
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);

-- Policy: Only admins can update scheduled broadcasts
CREATE POLICY "Admins can update scheduled broadcasts"
ON public.scheduled_broadcasts
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);

-- Policy: Only admins can delete scheduled broadcasts
CREATE POLICY "Admins can delete scheduled broadcasts"
ON public.scheduled_broadcasts
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_scheduled_broadcasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_scheduled_broadcasts_updated_at
    BEFORE UPDATE ON public.scheduled_broadcasts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_scheduled_broadcasts_updated_at();

-- Create table to track scheduled broadcast execution history
CREATE TABLE IF NOT EXISTS public.scheduled_broadcast_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scheduled_broadcast_id UUID NOT NULL REFERENCES public.scheduled_broadcasts(id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ DEFAULT now(),
    total_recipients INTEGER DEFAULT 0,
    successful_sends INTEGER DEFAULT 0,
    failed_sends INTEGER DEFAULT 0,
    error_message TEXT
);

-- Create index on scheduled_broadcast_id
CREATE INDEX IF NOT EXISTS idx_scheduled_broadcast_history_broadcast_id 
ON public.scheduled_broadcast_history(scheduled_broadcast_id);

-- Enable Row Level Security
ALTER TABLE public.scheduled_broadcast_history ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view history
CREATE POLICY "Admins can view scheduled broadcast history"
ON public.scheduled_broadcast_history
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);
