import { supabase } from '@/integrations/supabase/client';

/**
 * Bulk approve all existing images that haven't been approved yet.
 * This is a one-time migration to fix images that were uploaded before
 * the moderation system was implemented.
 */
export async function bulkApproveExistingImages(): Promise<void> {
  try {
    // Get all images that are not approved or have null approval status
    const { data: unapprovedImages, error: fetchError } = await supabase
      .from('user_images')
      .select('id, user_id, image_url, is_approved, moderation_status')
      .or('is_approved.is.null,is_approved.eq.false,moderation_status.is.null,moderation_status.eq.pending');

    if (fetchError) {
      console.error('Error fetching unapproved images:', fetchError);
      return;
    }

    if (!unapprovedImages || unapprovedImages.length === 0) {
      return;
    }

    // Update all unapproved images to approved
    const { error: updateError } = await supabase
      .from('user_images')
      .update({
        is_approved: true,
        moderation_status: 'approved',
        moderation_notes: 'Bulk approved - legacy image'
      })
      .or('is_approved.is.null,is_approved.eq.false,moderation_status.is.null,moderation_status.eq.pending');

    if (updateError) {
      console.error('Error bulk approving images:', updateError);
      return;
    }
  } catch (error) {
    console.error('Bulk approval failed:', error);
  }
}
