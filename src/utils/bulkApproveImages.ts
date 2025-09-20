/**
 * Utility function to bulk approve existing images that were incorrectly flagged
 * Run this once to fix all old "Pending Review" images
 */

import { supabase } from '@/integrations/supabase/client';

export async function bulkApproveExistingImages(): Promise<void> {
  try {
    // First, check the current state
    const { data: countData, error: countError } = await supabase
      .from('user_images')
      .select('is_approved, moderation_status')
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Dummy condition to get all

    if (countError) {
      console.error('Error checking current state:', countError);
      return;
    }

    const totalImages = countData?.length || 0;
    const pendingImages = countData?.filter(img => 
      img.is_approved === false || img.moderation_status === 'pending'
    ).length || 0;

    if (pendingImages === 0) {
      return;
    }

    // Bulk approve all pending images
    const { error: updateError } = await supabase
      .from('user_images')
      .update({
        is_approved: true,
        moderation_status: 'approved',
        moderation_notes: 'Bulk approved after moderation logic fix'
      })
      .or('is_approved.eq.false,moderation_status.eq.pending');

    if (updateError) {
      console.error('Error bulk approving images:', updateError);
      return;
    }
    
  } catch (error) {
    console.error('Bulk approval failed:', error);
  }
}
