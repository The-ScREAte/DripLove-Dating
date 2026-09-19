// Circle has its own daily allowance, separate from Discover's swipe cap:
// free users get 20 likes (right swipes only - passing is always free and
// unlimited) per day on the Circle page, refilling at midnight. Stored on
// user_usage.circle_likes_used so the count follows the account across
// devices, exactly like the Discover swipe counter does.
import { supabase } from '@/integrations/supabase/client';

export const FREE_CIRCLE_DAILY_LIKES = 20;

const todayKey = () => new Date().toISOString().split('T')[0];

export const getCircleLikesUsedToday = async (userId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('user_usage')
    .select('circle_likes_used')
    .eq('user_id', userId)
    .eq('date', todayKey())
    .maybeSingle();
  if (error || !data) return 0;
  return data.circle_likes_used ?? 0;
};

/** Records one Circle like for today and returns the new total. */
export const incrementCircleLikesUsed = async (userId: string): Promise<number> => {
  const date = todayKey();
  const { data: existing } = await supabase
    .from('user_usage')
    .select('id, circle_likes_used')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (existing) {
    const next = (existing.circle_likes_used ?? 0) + 1;
    await supabase.from('user_usage').update({ circle_likes_used: next }).eq('id', existing.id);
    return next;
  }

  const { error } = await supabase
    .from('user_usage')
    .insert({ user_id: userId, date, circle_likes_used: 1 });
  // A racing insert from another tab/device simply means the row now exists;
  // re-read rather than losing the count.
  if (error) return await getCircleLikesUsedToday(userId);
  return 1;
};
