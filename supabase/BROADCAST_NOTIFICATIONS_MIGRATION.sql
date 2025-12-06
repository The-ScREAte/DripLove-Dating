-- Migration: Add broadcast notifications tracking tables
-- Run this SQL in your Supabase SQL editor

-- Create broadcast_campaigns table to store notification campaigns
CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT DEFAULT 'system',
    target_countries TEXT[] DEFAULT '{}',
    total_recipients INTEGER DEFAULT 0,
    successful_sends INTEGER DEFAULT 0,
    failed_sends INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create broadcast_recipients table to track individual delivery status
CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', -- pending, sent, failed
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(campaign_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_admin_id ON public.broadcast_campaigns(admin_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_created_at ON public.broadcast_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign_id ON public.broadcast_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON public.broadcast_recipients(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_user_id ON public.broadcast_recipients(user_id);

-- Enable Row Level Security
ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can access broadcast data
CREATE POLICY "Admins can view all broadcast campaigns"
    ON public.broadcast_campaigns
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can create broadcast campaigns"
    ON public.broadcast_campaigns
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can update broadcast campaigns"
    ON public.broadcast_campaigns
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can delete broadcast campaigns"
    ON public.broadcast_campaigns
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

-- RLS Policies for broadcast_recipients
CREATE POLICY "Admins can view all broadcast recipients"
    ON public.broadcast_recipients
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can create broadcast recipients"
    ON public.broadcast_recipients
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can update broadcast recipients"
    ON public.broadcast_recipients
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can delete broadcast recipients"
    ON public.broadcast_recipients
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

-- Grant permissions
GRANT ALL ON public.broadcast_campaigns TO authenticated;
GRANT ALL ON public.broadcast_recipients TO authenticated;

-- Add comment
COMMENT ON TABLE public.broadcast_campaigns IS 'Stores broadcast notification campaigns sent by admins';
COMMENT ON TABLE public.broadcast_recipients IS 'Tracks individual delivery status for each recipient in a broadcast campaign';
