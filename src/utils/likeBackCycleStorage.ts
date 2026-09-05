/**
 * Persisted state for the "people who liked you" Discover injection cycle.
 *
 * Why persisted (not just an in-memory ref): the schedule is keyed by real
 * calendar days since the user's first-ever like, so state has to survive
 * reloads, app restarts, and multi-day absences - an in-memory-only tracker
 * would restart the cycle every time the app is closed and reopened.
 *
 * The cycle only starts at all once the user has ever received their first
 * like; before that it stays permanently dormant. Once started, each
 * calendar day gets a reveal quota from a repeating 9-day table (see
 * DAY_QUOTA_CYCLE in likeBackSchedule.ts) - day 1 of the cycle gets that
 * table's first entry, day 10 wraps back to the first entry again, and so
 * on. A day's quota (if any) is delivered within that day's first 30
 * swipes, never two reveals back-to-back.
 */

export interface LikeBackCycleState {
  /** Becomes true, permanently, the first time we detect the user has ever received a like. */
  hasStarted: boolean;
  /** Date string (YYYY-MM-DD, UTC) of the day the cycle started - day 1 of the schedule. */
  cycleStartDateStr: string | null;
  /** Date string (YYYY-MM-DD, UTC) this state was last advanced for - detects day rollover. */
  currentDayStr: string | null;
  /** How many real swipes have landed since the start of currentDayStr. */
  swipesToday: number;
  /** Swipe-of-the-day numbers (1-based, within the first 30) chosen for today's quota. */
  plannedOffsetsToday: number[];
  /** Cumulative real-swipe counter, for the cross-day "never back to back" gap check. */
  swipesGlobal: number;
  /** swipesGlobal value at the last actual reveal, for the same back-to-back check. */
  lastInjectionAtSwipeGlobal: number;
}

const defaultState: LikeBackCycleState = {
  hasStarted: false,
  cycleStartDateStr: null,
  currentDayStr: null,
  swipesToday: 0,
  plannedOffsetsToday: [],
  swipesGlobal: 0,
  // Sentinel meaning "no injection has ever happened yet" - NOT swipe 0. Using
  // 0 here made the "never back to back" gap check misread cycle start as a
  // recent injection, silently dropping any reveal planned within the first
  // couple of swipes of day 1.
  lastInjectionAtSwipeGlobal: -1000,
};

const keyFor = (userId: string) => `driplove_likeback_cycle_${userId}`;

export const readLikeBackCycle = (userId: string | undefined): LikeBackCycleState => {
  if (!userId) return { ...defaultState };
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw) as Partial<LikeBackCycleState>;
    return { ...defaultState, ...parsed };
  } catch {
    return { ...defaultState };
  }
};

export const writeLikeBackCycle = (userId: string | undefined, state: LikeBackCycleState): void => {
  if (!userId) return;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(state));
  } catch {
    // storage full/disabled - the cycle just won't persist across reloads this time
  }
};
