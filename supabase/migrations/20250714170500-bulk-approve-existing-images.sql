-- Bulk approve existing images that were incorrectly flagged by the old aggressive moderation
-- This fixes the issue where all old images show "Pending Review"

-- First, let's see what we have
SELECT 
  count(*) as total_images,
  count(*) FILTER (WHERE is_approved = false) as pending_images,
  count(*) FILTER (WHERE is_approved = true) as approved_images,
  count(*) FILTER (WHERE moderation_status = 'pending') as status_pending,
  count(*) FILTER (WHERE moderation_status = 'approved') as status_approved
FROM user_images;

-- Bulk approve all images that are currently pending but should be approved
-- (since our new logic is ultra-permissive, we can safely approve most existing images)
UPDATE user_images 
SET 
  is_approved = true,
  moderation_status = 'approved',
  moderation_notes = 'Bulk approved after moderation logic fix - ' || COALESCE(moderation_notes, 'Previously flagged by aggressive algorithm')
WHERE 
  (is_approved = false OR moderation_status = 'pending')
  AND flagged_content IS NULL OR cardinality(flagged_content) = 0 
  OR (
    flagged_content IS NOT NULL 
    AND NOT (
      'Explicit content detected' = ANY(flagged_content) 
      OR 'Adult content detected' = ANY(flagged_content)
      OR 'Inappropriate content detected' = ANY(flagged_content)
    )
  );

-- For images that were flagged for non-content reasons (like poor quality, no face), approve them too
UPDATE user_images 
SET 
  is_approved = true,
  moderation_status = 'approved',
  moderation_notes = 'Auto-approved - quality flags only'
WHERE 
  (is_approved = false OR moderation_status = 'pending')
  AND flagged_content IS NOT NULL
  AND (
    flagged_content && ARRAY['No face detected in image', 'Image quality is too poor', 'Multiple faces detected']
    AND NOT (flagged_content && ARRAY['Explicit content detected', 'Adult content detected', 'Inappropriate content detected'])
  );

-- Show the results after update
SELECT 
  count(*) as total_images,
  count(*) FILTER (WHERE is_approved = false) as pending_images,
  count(*) FILTER (WHERE is_approved = true) as approved_images,
  count(*) FILTER (WHERE moderation_status = 'pending') as status_pending,
  count(*) FILTER (WHERE moderation_status = 'approved') as status_approved
FROM user_images;
