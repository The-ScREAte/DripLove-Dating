-- Broadcast queue hardening: atomic claiming + stale processing recovery
--
-- Goals:
-- 1) Prevent two workers from sending the same recipient (atomic claim)
-- 2) Self-heal recipients stuck in 'processing' after worker crash

ALTER TABLE public.broadcast_recipients
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_processing
ON public.broadcast_recipients (campaign_id, status, processing_started_at)
WHERE status = 'processing';

-- Atomically claim pending recipients for a campaign.
-- Uses SKIP LOCKED so concurrent workers do not claim the same rows.
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

-- Release stale processing recipients back to pending.
-- Use this to recover from crashes/timeouts.
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
