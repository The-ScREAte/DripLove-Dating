-- Simple script to bulk approve all existing images
-- This will fix the "Pending Review" issue for old images

-- Check current state
SELECT 
  count(*) as total_images,
  count(*) FILTER (WHERE is_approved = false) as pending_count,
  count(*) FILTER (WHERE is_approved = true) as approved_count
FROM user_images;

-- Bulk approve all existing images (since our new logic is ultra-permissive)
UPDATE user_images 
SET 
  is_approved = true,
  moderation_status = 'approved',
  moderation_notes = COALESCE(moderation_notes, '') || ' [Bulk approved after moderation fix]'
WHERE is_approved = false OR moderation_status = 'pending';

-- Check results
SELECT 
  count(*) as total_images,
  count(*) FILTER (WHERE is_approved = false) as pending_count,
  count(*) FILTER (WHERE is_approved = true) as approved_count
FROM user_images;
