import { useIcebreakerAvailable, useIcebreakerQuota } from '@/services/icebreaker';
import { defaultQuota, type IcebreakerQuota } from '@/utils/icebreaker';
import { getIcebreakerHandlers } from './store';

/**
 * The quota to SHOW: the server's value when we have it; while the backend is unreachable (migration not
 * applied yet) a default for the user's plan, so the number is always visible (10 a week).
 * While the backend is still loading we show nothing, so the number never flickers.
 */
export function useChances(): IcebreakerQuota | null {
  const quota = useIcebreakerQuota();
  const available = useIcebreakerAvailable();
  if (quota) return quota;
  if (available === false) return defaultQuota(!!getIcebreakerHandlers().isPremium);
  return null;
}
