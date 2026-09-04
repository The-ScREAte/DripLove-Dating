import { describe, it, expect } from 'vitest';
import { advanceLikeBackCycle, planBurstOffsets, BURST_SIZE, BURST_QUOTA } from '../likeBackSchedule';
import { GAP_ROTATION_DAYS, readLikeBackCycle, type LikeBackCycleState } from '../likeBackCycleStorage';

const freshState = () => readLikeBackCycle(undefined);

/** Advance `count` swipes, returning the final state and each swipe's shouldInject flag. */
const runSwipes = (state: LikeBackCycleState, count: number, hasEverBeenLiked: boolean) => {
  let current = state;
  const injections: boolean[] = [];
  for (let i = 0; i < count; i++) {
    const { next, shouldInject } = advanceLikeBackCycle(current, hasEverBeenLiked);
    current = next;
    injections.push(shouldInject);
  }
  return { finalState: current, injections };
};

/** Advance swipes until the cycle reaches `targetPhase` (safety-capped). */
const runUntilPhase = (
  state: LikeBackCycleState,
  targetPhase: LikeBackCycleState['phase'],
  hasEverBeenLiked: boolean,
  cap = 500
) => {
  let current = state;
  const injections: boolean[] = [];
  let steps = 0;
  while (current.phase !== targetPhase && steps < cap) {
    const { next, shouldInject } = advanceLikeBackCycle(current, hasEverBeenLiked);
    current = next;
    injections.push(shouldInject);
    steps += 1;
  }
  expect(steps).toBeLessThan(cap); // sanity: didn't just hit the safety cap
  return { finalState: current, injections };
};

describe('advanceLikeBackCycle', () => {
  it('stays fully dormant until the user has ever received a like', () => {
    const { finalState, injections } = runSwipes(freshState(), 50, false);
    expect(finalState.hasStarted).toBe(false);
    expect(injections.every((v) => v === false)).toBe(true);
  });

  it('reveals exactly BURST_QUOTA.burst1 times across burst1s own BURST_SIZE swipes', () => {
    // Exactly BURST_SIZE swipes covers burst1 in full without touching the
    // burst1->burst2 boundary swipe - that boundary call intentionally
    // evaluates against burst2's freshly-planned offsets in the same call
    // (see advanceLikeBackCycle's comment on why), so counting past it would
    // sometimes attribute one of burst2's own reveals to burst1 by mistake.
    const { finalState, injections } = runSwipes(freshState(), BURST_SIZE, true);
    expect(finalState.hasStarted).toBe(true);
    expect(finalState.phase).toBe('burst1');
    expect(injections.filter(Boolean).length).toBe(BURST_QUOTA.burst1);
  });

  it('completes a full burst1 -> burst2 -> quiet cycle revealing exactly quota totals for each burst', () => {
    const { injections, finalState } = runUntilPhase(freshState(), 'quiet', true);
    expect(finalState.phase).toBe('quiet');
    expect(finalState.quietUntil).not.toBeNull();
    // Across the whole run to reach quiet, total reveals = both bursts' quotas combined.
    expect(injections.filter(Boolean).length).toBe(BURST_QUOTA.burst1 + BURST_QUOTA.burst2);
  });

  it('uses a 3-day gap for the first quiet phase, and stays silent until it elapses', () => {
    const { finalState: quietState } = runUntilPhase(freshState(), 'quiet', true);

    const expectedGapMs = GAP_ROTATION_DAYS[0] * 24 * 60 * 60 * 1000;
    const actualGapMs = (quietState.quietUntil as number) - Date.now();
    // Allow a little slack for test execution time.
    expect(actualGapMs).toBeGreaterThan(expectedGapMs - 2000);
    expect(actualGapMs).toBeLessThanOrEqual(expectedGapMs);

    // Still within the gap - no reveals, phase unchanged.
    const { finalState: stillQuiet, injections } = runSwipes(quietState, 10, true);
    expect(stillQuiet.phase).toBe('quiet');
    expect(injections.every((v) => v === false)).toBe(true);
  });

  it('resumes at burst1 once the quiet gap has elapsed', () => {
    const { finalState: quietState } = runUntilPhase(freshState(), 'quiet', true);

    // Simulate the gap having already elapsed.
    const elapsedQuiet: LikeBackCycleState = { ...quietState, quietUntil: Date.now() - 1000 };
    const { next } = advanceLikeBackCycle(elapsedQuiet, true);
    expect(next.phase).toBe('burst1');
    expect(next.swipesInPhase).toBe(1);
  });

  it('rotates the quiet gap 3 -> 5 -> 4 -> 3 across four full cycles', () => {
    let state = freshState();
    const observedGapsDays: number[] = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      if (state.phase === 'quiet') {
        // Fast-forward past the gap, then actually run the transition swipe.
        const elapsed = { ...state, quietUntil: Date.now() - 1000 };
        state = advanceLikeBackCycle(elapsed, true).next;
      }
      const { finalState: quietState } = runUntilPhase(state, 'quiet', true);
      const gapDays = Math.round(((quietState.quietUntil as number) - Date.now()) / (24 * 60 * 60 * 1000));
      observedGapsDays.push(gapDays);
      state = quietState;
    }
    expect(observedGapsDays).toEqual([3, 5, 4, 3]);
  });

  it('never reveals within 3 swipes of another reveal within the same burst', () => {
    for (let trial = 0; trial < 25; trial++) {
      const { injections } = runSwipes(freshState(), BURST_SIZE, true);
      const revealSwipeNumbers = injections
        .map((v, idx) => (v ? idx + 1 : null))
        .filter((v): v is number => v !== null);
      for (let i = 1; i < revealSwipeNumbers.length; i++) {
        expect(revealSwipeNumbers[i] - revealSwipeNumbers[i - 1]).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('never under-delivers a burst quota because offset 1 landed on a phase-transition swipe', () => {
    // Regression test: offset 1 used to be structurally unreachable for
    // burst2 specifically (entered only via a transition that skipped
    // evaluating its own swipe), silently capping burst2 below quota
    // whenever planBurstOffsets happened to choose it. Run many trials to
    // reliably surface that flake if it comes back.
    for (let trial = 0; trial < 100; trial++) {
      const { injections } = runUntilPhase(freshState(), 'quiet', true);
      expect(injections.filter(Boolean).length).toBe(BURST_QUOTA.burst1 + BURST_QUOTA.burst2);
    }
  });
});

describe('planBurstOffsets', () => {
  it('returns distinct, in-range, minimum-gap-respecting offsets', () => {
    for (let trial = 0; trial < 50; trial++) {
      const offsets = planBurstOffsets(3).sort((a, b) => a - b);
      expect(offsets.length).toBe(3);
      expect(new Set(offsets).size).toBe(3);
      offsets.forEach((o) => {
        expect(o).toBeGreaterThanOrEqual(1);
        expect(o).toBeLessThanOrEqual(BURST_SIZE);
      });
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i] - offsets[i - 1]).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
