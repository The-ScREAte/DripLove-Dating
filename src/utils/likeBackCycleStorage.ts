/**
 * Persisted state for the "people who liked you" Discover injection cycle.
 *
 * Why persisted (not just an in-memory ref): the cycle's quiet gaps are
 * measured in real days, not swipes, so state has to survive reloads,
 * app restarts, and multi-day absences - an in-memory-only tracker would
 * restart the whole cycle every time the app is closed and reopened.
 *
 * One cycle = burst1 (2 reveals across up to 20 swipes) -> burst2 (3 reveals
 * across up to 20 swipes) -> quiet (a rotating 3/5/4-day gap) -> repeat from
 * burst1. The cycle only starts at all once the user has ever received their
 * first like; before that it stays permanently dormant.
 */

export type LikeBackPhase = 'burst1' | 'burst2' | 'quiet';

export interface LikeBackCycleState {
  /** Becomes true, permanently, the first time we detect the user has ever received a like. */
  hasStarted: boolean;
  phase: LikeBackPhase;
  /** How many real swipes have landed since entering the current phase. */
  swipesInPhase: number;
  /** Swipe-in-phase numbers (1-based) chosen at random for a reveal this phase. */
  plannedOffsets: number[];
  /** Epoch ms the current quiet phase ends; only meaningful while phase === 'quiet'. */
  quietUntil: number | null;
  /** Index into the [3, 5, 4] day rotation for the *next* quiet phase. */
  gapRotationIndex: number;
  /** Cumulative real-swipe counter, for the cross-phase "never back to back" gap check. */
  swipesGlobal: number;
  /** swipesGlobal value at the last actual reveal, for the same back-to-back check. */
  lastInjectionAtSwipeGlobal: number;
}

export const GAP_ROTATION_DAYS: ReadonlyArray<number> = [3, 5, 4];

const defaultState: LikeBackCycleState = {
  hasStarted: false,
  phase: 'burst1',
  swipesInPhase: 0,
  plannedOffsets: [],
  quietUntil: null,
  gapRotationIndex: 0,
  swipesGlobal: 0,
  // Sentinel meaning "no injection has ever happened yet" - NOT swipe 0. Using
  // 0 here made the "never back to back" gap check misread cycle start as a
  // recent injection, silently dropping any reveal planned within the first
  // couple of swipes of the very first burst.
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
