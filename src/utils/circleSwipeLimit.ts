// Circle has its own daily allowance, separate from Discover's swipe cap:
// free users get 20 likes (right swipes only - passing is always free and
// unlimited) per day on the Circle page, refilling at midnight. Stored on
// user_usage.circle_likes_used so the count follows the account across
// devices, exactly like the Discover swipe counter does.
import { supabase } from '@/integrations/supabase/client';

export const FREE_CIRCLE_DAILY_LIKES = 20;
export const PREMIUM_CIRCLE_DAILY_LIKES = 100;

export const getCircleDailyLikeLimit = (isPremium?: boolean): number =>
  isPremium ? PREMIUM_CIRCLE_DAILY_LIKES : FREE_CIRCLE_DAILY_LIKES;

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


export interface CircleLikeResult {
  success: boolean;
  limitReached: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  match: boolean;
}

/** Atomically records a Circle like and its tier-specific daily usage. */
export const recordCircleLike = async (
  userId: string,
  likedUserId: string,
  isPremium?: boolean
): Promise<CircleLikeResult> => {
  const limit = getCircleDailyLikeLimit(isPremium);
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)('circle_like_and_usage_batched', {
    liker_id_param: userId,
    liked_id_param: likedUserId,
    premium_param: !!isPremium,
  });
  if (error) throw error;
  const result = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    success: result.success === true,
    limitReached: result.limit_reached === true,
    currentUsage: typeof result.current_usage === 'number' ? result.current_usage : limit,
    limit: typeof result.limit === 'number' ? result.limit : limit,
    remaining: typeof result.remaining === 'number' ? result.remaining : 0,
    match: result.match === true,
  };
};
