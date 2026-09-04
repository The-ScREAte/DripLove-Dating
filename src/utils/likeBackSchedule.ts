import { GAP_ROTATION_DAYS, type LikeBackCycleState } from './likeBackCycleStorage';

/**
 * Pure scheduling logic for the "people who liked you" Discover injection
 * cycle. Kept dependency-free (no Supabase/React) so it's trivially unit
 * testable and so importing it doesn't pull in browser-only globals.
 *
 * See useLikeBackInjection.ts for how this plugs into real swipes/candidates.
 */

export const BURST_SIZE = 20; // swipes per burst phase
export const BURST_QUOTA: Record<'burst1' | 'burst2', number> = { burst1: 2, burst2: 3 };
export const MIN_GAP_BETWEEN_INJECTIONS = 3; // never two reveals back-to-back (measured in real swipes)

// Pick `quota` distinct swipe-in-phase numbers (1-based, within a BURST_SIZE-long
// phase), spaced by at least MIN_GAP_BETWEEN_INJECTIONS, so reveals land at a
// random-feeling position within the burst rather than a predictable cadence.
export const planBurstOffsets = (quota: number): number[] => {
  const pool: number[] = [];
  for (let s = 1; s <= BURST_SIZE; s++) pool.push(s);

  const chosen: number[] = [];
  while (chosen.length < quota && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const candidate = pool.splice(idx, 1)[0];
    if (chosen.every((c) => Math.abs(c - candidate) >= MIN_GAP_BETWEEN_INJECTIONS)) {
      chosen.push(candidate);
    }
  }
  // Fallback: min-gap filtering left us short (only possible with a tiny
  // burst relative to quota) - fill remaining slots ignoring the gap rule
  // rather than under-delivering the burst's quota.
  while (chosen.length < quota && pool.length > 0) {
    chosen.push(pool.pop() as number);
  }
  return chosen;
};

// Advance the persisted cycle by exactly one real swipe, deciding whether
// this swipe is a reveal slot. Pure function of (state, hasEverBeenLiked) so
// it's easy to reason about/test independent of React and the network.
export const advanceLikeBackCycle = (
  state: LikeBackCycleState,
  hasEverBeenLiked: boolean
): { next: LikeBackCycleState; shouldInject: boolean } => {
  const next: LikeBackCycleState = { ...state };

  if (!next.hasStarted) {
    if (!hasEverBeenLiked) return { next, shouldInject: false };
    // First like ever received - the cycle begins right now, from burst1.
    next.hasStarted = true;
    next.phase = 'burst1';
    next.swipesInPhase = 0;
    next.plannedOffsets = planBurstOffsets(BURST_QUOTA.burst1);
  }

  next.swipesGlobal += 1;

  if (next.phase === 'quiet') {
    if (next.quietUntil == null || Date.now() < next.quietUntil) {
      return { next, shouldInject: false };
    }
    // Quiet gap elapsed - re-enter burst1.
    next.phase = 'burst1';
    next.swipesInPhase = 0;
    next.plannedOffsets = planBurstOffsets(BURST_QUOTA.burst1);
    next.quietUntil = null;
  }

  // Uniform for every burst phase, including the very first swipe of a
  // freshly (re)entered one: advance swipesInPhase by exactly one, then
  // evaluate it against that phase's plan below. No special-cased "this
  // transition swipe never reveals" asymmetry - that used to make offset 1
  // structurally unreachable for burst2 (entered only via a transition)
  // while remaining reachable for burst1 (entered via cold-start or a quiet
  // exit, which fell through to evaluation), silently capping burst2's
  // effective quota below 3 whenever planBurstOffsets happened to choose it.
  next.swipesInPhase += 1;

  if (next.swipesInPhase > BURST_SIZE) {
    if (next.phase === 'burst1') {
      next.phase = 'burst2';
      next.swipesInPhase = 1;
      next.plannedOffsets = planBurstOffsets(BURST_QUOTA.burst2);
    } else {
      next.phase = 'quiet';
      next.swipesInPhase = 0;
      const days = GAP_ROTATION_DAYS[next.gapRotationIndex % GAP_ROTATION_DAYS.length];
      next.quietUntil = Date.now() + days * 24 * 60 * 60 * 1000;
      next.gapRotationIndex += 1;
      next.plannedOffsets = [];
      return { next, shouldInject: false }; // quiet never reveals
    }
  }

  const isPlannedSlot = next.plannedOffsets.includes(next.swipesInPhase);
  const gapOk = next.swipesGlobal - next.lastInjectionAtSwipeGlobal >= MIN_GAP_BETWEEN_INJECTIONS;
  return { next, shouldInject: isPlannedSlot && gapOk };
};
