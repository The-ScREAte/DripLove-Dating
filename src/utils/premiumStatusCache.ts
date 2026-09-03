/**
 * Last-known premium status, cached per user.
 *
 * Premium checks go over the network (RPC + subscription row). On a flaky
 * connection - very common on mobile data - those calls can fail or return
 * late, and every consumer that treats "not premium yet" as "free" will
 * wrongly apply free-tier limits to a paying subscriber (e.g. the Discover
 * swipe cap firing at 29 for someone entitled to 200).
 *
 * This cache remembers the last *confirmed* answer so those consumers can
 * fall back to it instead of defaulting to free. It is a UX safeguard only -
 * every real entitlement (payments, feature gating server-side) is still
 * enforced in the database.
 */

const KEY_PREFIX = 'premium_status_v1_';
// Long enough to cover offline stretches, short enough that a genuinely
// lapsed subscription stops being treated as premium.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedPremium = {
  premium: boolean;
  at: number;
};

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export const readCachedPremiumStatus = (userId?: string | null): boolean | null => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPremium;
    if (typeof parsed?.premium !== 'boolean' || typeof parsed?.at !== 'number') return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed.premium;
  } catch {
    return null;
  }
};

export const writeCachedPremiumStatus = (userId?: string | null, premium?: boolean): void => {
  if (!userId || typeof premium !== 'boolean') return;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify({ premium, at: Date.now() } satisfies CachedPremium));
  } catch {
    // storage full / disabled - the cache is best-effort
  }
};
