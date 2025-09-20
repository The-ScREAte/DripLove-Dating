-- Fix overly sensitive moderation - auto-approve decent images
-- Run this in your Supabase SQL Editor

-- Auto-approve images that were flagged for minor issues
UPDATE user_images 
SET 
  is_approved = true,
  moderation_status = 'approved',
  moderation_notes = 'Auto-approved after moderation sensitivity fix - ' || COALESCE(moderation_notes, 'No issues found')
WHERE 
  is_approved = false 
  AND moderation_status = 'pending'
  AND (
    -- Approve images with only minor flags
    flagged_content IS NULL OR
    cardinality(flagged_content) = 0 OR
    (
      flagged_content IS NOT NULL AND
      NOT (flagged_content && ARRAY['Explicit content detected']) AND
      NOT (flagged_content && ARRAY['Adult content detected'])
    )
  );

-- Show results
SELECT 
  COUNT(*) as total_images,
  COUNT(*) FILTER (WHERE is_approved = true) as approved_images,
  COUNT(*) FILTER (WHERE is_approved = false) as pending_images,
  COUNT(*) FILTER (WHERE moderation_status = 'approved') as status_approved,
  COUNT(*) FILTER (WHERE moderation_status = 'pending') as status_pending
FROM user_images;
