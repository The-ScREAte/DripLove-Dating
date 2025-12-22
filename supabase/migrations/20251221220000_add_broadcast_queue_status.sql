-- Add status enum and retry tracking for broadcast campaigns
-- This enables queue-based processing and prevents double-sends

-- Add status column to broadcast_campaigns
ALTER TABLE broadcast_campaigns 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued' CHECK (status IN ('draft', 'queued', 'processing', 'completed'));

-- Add retry_count column to broadcast_recipients
ALTER TABLE broadcast_recipients 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add index for queue processing (critical for performance)
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_pending 
ON broadcast_recipients(campaign_id, status, retry_count) 
WHERE status = 'pending';

-- Add index for campaign status queries
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status 
ON broadcast_campaigns(status, created_at);

-- Update existing campaigns to 'completed' status (one-time migration)
UPDATE broadcast_campaigns 
SET status = 'completed' 
WHERE status IS NULL OR status = 'queued';

-- Comment for documentation
COMMENT ON COLUMN broadcast_campaigns.status IS 'Campaign processing state: draft (not yet queued), queued (waiting for worker), processing (worker active), completed (all recipients processed)';
COMMENT ON COLUMN broadcast_recipients.retry_count IS 'Number of send attempts for this recipient (max 3 retries)';
