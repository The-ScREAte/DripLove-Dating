-- URGENT: Apply this to your Supabase production database NOW
-- This adds the missing columns that are causing the 400 errors

-- 1. Add status column to broadcast_campaigns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'broadcast_campaigns' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.broadcast_campaigns 
    ADD COLUMN status TEXT DEFAULT 'queued' CHECK (status IN ('draft', 'queued', 'processing', 'completed'));
    
    CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status 
    ON public.broadcast_campaigns(status, created_at);
    
    -- Update existing campaigns to 'completed'
    UPDATE public.broadcast_campaigns 
    SET status = 'completed' 
    WHERE status IS NULL;
  END IF;
END $$;

-- 2. Add retry_count to broadcast_recipients
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'broadcast_recipients' 
    AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.broadcast_recipients 
    ADD COLUMN retry_count INTEGER DEFAULT 0;
    
    CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_pending 
    ON public.broadcast_recipients(campaign_id, status, retry_count) 
    WHERE status = 'pending';
  END IF;
END $$;

-- 3. Add processing_started_at to broadcast_recipients (for atomic locking)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'broadcast_recipients' 
    AND column_name = 'processing_started_at'
  ) THEN
    ALTER TABLE public.broadcast_recipients
    ADD COLUMN processing_started_at TIMESTAMPTZ;
    
    CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_processing
    ON public.broadcast_recipients (campaign_id, status, processing_started_at)
    WHERE status = 'processing';
  END IF;
END $$;

-- 4. Create the atomic claim function (for worker concurrency safety)
CREATE OR REPLACE FUNCTION public.claim_broadcast_recipients(
  p_campaign_id UUID,
  p_batch_size INT,
  p_max_retries INT
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  retry_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH to_claim AS (
    SELECT r.id
    FROM public.broadcast_recipients r
    WHERE r.campaign_id = p_campaign_id
      AND r.status = 'pending'
      AND COALESCE(r.retry_count, 0) < p_max_retries
    ORDER BY r.created_at NULLS LAST
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.broadcast_recipients r
  SET
    status = 'processing',
    processing_started_at = now()
  FROM to_claim
  WHERE r.id = to_claim.id
  RETURNING r.id, r.user_id, COALESCE(r.retry_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_broadcast_recipients(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_recipients(UUID, INT, INT) TO service_role;

-- 5. Create the self-heal function (recovers stuck processing)
CREATE OR REPLACE FUNCTION public.release_stale_broadcast_recipients(
  p_stale_after INTERVAL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  released_count INT;
BEGIN
  UPDATE public.broadcast_recipients
  SET
    status = 'pending',
    processing_started_at = NULL
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND processing_started_at < (now() - p_stale_after)
    AND sent_at IS NULL;

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_broadcast_recipients(INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stale_broadcast_recipients(INTERVAL) TO service_role;

-- Done! Your broadcast system should work now.
