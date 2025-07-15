-- Create notifications table for storing user notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'system',
    is_read BOOLEAN DEFAULT FALSE,
    related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view their own notifications" 
ON public.notifications 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications" 
ON public.notifications 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Service role can insert notifications for any user
CREATE POLICY "Service role can insert notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR auth.uid() IS NOT NULL);

-- Admins can view all notifications
CREATE POLICY "Admins can view all notifications" 
ON public.notifications 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND is_admin = true
    )
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notifications_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.notifications IS 'Stores user notifications for the dating app';
COMMENT ON COLUMN public.notifications.type IS 'Notification type: match, message, like, system, admin';
COMMENT ON COLUMN public.notifications.related_user_id IS 'ID of related user (for match, like, message notifications)';
COMMENT ON COLUMN public.notifications.data IS 'Additional notification data (JSON)';
