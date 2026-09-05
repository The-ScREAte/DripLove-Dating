import type { LikeBackCycleState } from './likeBackCycleStorage';

/**
 * Pure scheduling logic for the "people who liked you" Discover injection
 * cycle. Kept dependency-free (no Supabase/React) so it's trivially unit
 * testable and so importing it doesn't pull in browser-only globals.
 *
 * See useLikeBackInjection.ts for how this plugs into real swipes/candidates.
 */

export const DAY_WINDOW_SIZE = 30; // swipes per day eligible for that day's quota

// How many reveals a day gets, indexed by (days since cycle start) % 9.
// Day 1 of the cycle = index 0 = 2 reveals ("day one match just 2" for the
// free trial), then a lighter, day-varying cadence, repeating every 9 days
// (day 10 = day 1's quota again, etc).
export const DAY_QUOTA_CYCLE: ReadonlyArray<number> = [2, 1, 1, 0, 1, 0, 0, 1, 2];

export const MIN_GAP_BETWEEN_INJECTIONS = 3; // never two reveals back-to-back (measured in real swipes)

const todayStr = (): string => new Date().toISOString().split('T')[0];

const daysBetween = (fromDateStr: string, toDateStr: string): number => {
  const from = Date.UTC(...(fromDateStr.split('-').map(Number) as [number, number, number]));
  const to = Date.UTC(...(toDateStr.split('-').map(Number) as [number, number, number]));
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
};

export const quotaForCycleDay = (dayIndexFromZero: number): number => {
  const idx = ((dayIndexFromZero % DAY_QUOTA_CYCLE.length) + DAY_QUOTA_CYCLE.length) % DAY_QUOTA_CYCLE.length;
  return DAY_QUOTA_CYCLE[idx];
};

// Pick `quota` distinct swipe-of-the-day numbers (1-based, within the first
// DAY_WINDOW_SIZE swipes), spaced by at least MIN_GAP_BETWEEN_INJECTIONS, so
// reveals land at a random-feeling position within the day rather than a
// predictable cadence.
export const planDayOffsets = (quota: number): number[] => {
  const pool: number[] = [];
  for (let s = 1; s <= DAY_WINDOW_SIZE; s++) pool.push(s);

  const chosen: number[] = [];
  while (chosen.length < quota && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const candidate = pool.splice(idx, 1)[0];
    if (chosen.every((c) => Math.abs(c - candidate) >= MIN_GAP_BETWEEN_INJECTIONS)) {
      chosen.push(candidate);
    }
  }
  // Fallback: min-gap filtering left us short (only possible with a tiny
  // window relative to quota) - fill remaining slots ignoring the gap rule
  // rather than under-delivering the day's quota.
  while (chosen.length < quota && pool.length > 0) {
    chosen.push(pool.pop() as number);
  }
  return chosen;
};

// Advance the persisted cycle by exactly one real swipe, deciding whether
// this swipe is a reveal slot. Pure function of (state, hasEverBeenLiked,
// nowDateStr) so it's easy to reason about/test independent of React, the
// network, and the real wall clock.
export const advanceLikeBackCycle = (
  state: LikeBackCycleState,
  hasEverBeenLiked: boolean,
  nowDateStr: string = todayStr()
): { next: LikeBackCycleState; shouldInject: boolean } => {
  const next: LikeBackCycleState = { ...state };

  if (!next.hasStarted) {
    if (!hasEverBeenLiked) return { next, shouldInject: false };
    // First like ever received - the cycle begins right now, as day 1.
    next.hasStarted = true;
    next.cycleStartDateStr = nowDateStr;
    next.currentDayStr = nowDateStr;
    next.swipesToday = 0;
    next.plannedOffsetsToday = planDayOffsets(quotaForCycleDay(0));
  } else if (next.currentDayStr !== nowDateStr) {
    // A new calendar day has begun - roll to its quota. cycleStartDateStr
    // should already be set once hasStarted is true, but fall back to today
    // defensively rather than crash on a corrupt/partial persisted state.
    const dayIndex = daysBetween(next.cycleStartDateStr ?? nowDateStr, nowDateStr);
    next.currentDayStr = nowDateStr;
    next.swipesToday = 0;
    next.plannedOffsetsToday = planDayOffsets(quotaForCycleDay(dayIndex));
  }

  next.swipesGlobal += 1;
  next.swipesToday += 1;

  // Today's quota can only land within its first DAY_WINDOW_SIZE swipes -
  // once past that, today has nothing left to give regardless of quota.
  if (next.swipesToday > DAY_WINDOW_SIZE) {
    return { next, shouldInject: false };
  }

  const isPlannedSlot = next.plannedOffsetsToday.includes(next.swipesToday);
  const gapOk = next.swipesGlobal - next.lastInjectionAtSwipeGlobal >= MIN_GAP_BETWEEN_INJECTIONS;
  return { next, shouldInject: isPlannedSlot && gapOk };
};
