import { supabase } from '@/integrations/supabase/client';

// fetchCircleProfilesByIds (circlePoolFetch.ts) only returns the single
// firstImage it needs for a card background - the Circle Up "show more"
// info area wants the rest of a person's approved gallery too, so this
// fetches all of them, keyed by user id, ordered the same way.
export const fetchApprovedImages = async (userIds: string[]): Promise<Record<string, string[]>> => {
  if (userIds.length === 0) return {};
  const { data } = await supabase
    .from('user_images')
    .select('user_id, image_url, image_order')
    .in('user_id', userIds)
    .eq('is_approved', true)
    .neq('image_order', -1)
    .order('image_order', { ascending: true });

  const byUser: Record<string, string[]> = {};
  (data || []).forEach((row) => {
    if (!byUser[row.user_id]) byUser[row.user_id] = [];
    byUser[row.user_id].push(row.image_url);
  });
  return byUser;
};
