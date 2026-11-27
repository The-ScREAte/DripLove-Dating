// Pure rules for the Discover swipe pipeline (background refills, back-off, daily-limit re-checks).
// Kept free of React/network so the behaviour is unit-tested; DiscoverPage only calls these.

/** Gap between background refills while they keep finding people. */
export const REFILL_BASE_COOLDOWN_MS = 6_000;
/** Longest gap between refills once they keep coming back empty. */
export const REFILL_MAX_COOLDOWN_MS = 60_000;
/** Gap between the per-swipe urgent refills (few cards left) while refills succeed. */
export const URGENT_REFILL_GAP_MS = 1_500;

/** 6s, 12s, 24s, 48s, then 60s: doubles for every consecutive refill that found nobody new. */
export const refillCooldownMs = (emptyStreak: number): number =>
  Math.min(REFILL_MAX_COOLDOWN_MS, REFILL_BASE_COOLDOWN_MS * 2 ** Math.min(Math.max(0, Math.floor(emptyStreak)), 4));

/** Urgent per-swipe refills stay fast (1.5s) while they succeed, back off like the others once they do not. */
export const urgentRefillGapMs = (emptyStreak: number): number =>
  emptyStreak > 0 ? refillCooldownMs(emptyStreak) : URGENT_REFILL_GAP_MS;

/** The "no more profiles" recovery check: 15s, doubling to a 120s ceiling. */
export const RECOVERY_BASE_DELAY_MS = 15_000;
export const RECOVERY_MAX_DELAY_MS = 120_000;
export const nextRecoveryDelayMs = (current: number): number => Math.min(RECOVERY_MAX_DELAY_MS, Math.max(RECOVERY_BASE_DELAY_MS, current) * 2);

/**
 * Should the daily swipe count be re-read from the server now?
 *  - the (UTC) day changed while the app was open, or
 *  - the user is blocked at the limit and the last read is older than a minute (admin reset, other device, plan change).
 * Never while the app is hidden.
 */
export const shouldResyncSwipeCount = (input: { hidden: boolean; dayChanged: boolean; outOfSwipes: boolean; msSinceSync: number }): boolean => {
  if (input.hidden) return false;
  if (input.dayChanged) return true;
  return input.outOfSwipes && input.msSinceSync > 60_000;
};

/** Background loading only runs while the user can still swipe (out of swipes -> stop; resumes on reset). */
export const shouldPrefetch = (input: { outOfSwipes: boolean; hasCompletedInitialFetch: boolean; inFlight: boolean; noMoreProfiles: boolean; deckEmpty: boolean; remainingReal: number; threshold: number }): boolean =>
  !input.outOfSwipes && input.hasCompletedInitialFetch && !input.inFlight && !input.noMoreProfiles && !input.deckEmpty && input.remainingReal <= input.threshold;
