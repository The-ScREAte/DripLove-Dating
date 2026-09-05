import { describe, it, expect } from 'vitest';
import { advanceLikeBackCycle, planDayOffsets, quotaForCycleDay, DAY_WINDOW_SIZE, DAY_QUOTA_CYCLE } from '../likeBackSchedule';
import { readLikeBackCycle, type LikeBackCycleState } from '../likeBackCycleStorage';

const freshState = () => readLikeBackCycle(undefined);

const dateStr = (offsetDays: number): string => {
  const d = new Date('2026-01-01T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

/** Advance `count` swipes on a single given day, returning the final state and each swipe's shouldInject flag. */
const runSwipes = (state: LikeBackCycleState, count: number, hasEverBeenLiked: boolean, day: string) => {
  let current = state;
  const injections: boolean[] = [];
  for (let i = 0; i < count; i++) {
    const { next, shouldInject } = advanceLikeBackCycle(current, hasEverBeenLiked, day);
    current = next;
    injections.push(shouldInject);
  }
  return { finalState: current, injections };
};

describe('advanceLikeBackCycle', () => {
  it('stays fully dormant until the user has ever received a like', () => {
    const { finalState, injections } = runSwipes(freshState(), 50, false, dateStr(0));
    expect(finalState.hasStarted).toBe(false);
    expect(injections.every((v) => v === false)).toBe(true);
  });

  it('starts the cycle on day 1 (index 0) with a quota of 2', () => {
    const { finalState, injections } = runSwipes(freshState(), DAY_WINDOW_SIZE, true, dateStr(0));
    expect(finalState.hasStarted).toBe(true);
    expect(finalState.cycleStartDateStr).toBe(dateStr(0));
    expect(injections.filter(Boolean).length).toBe(DAY_QUOTA_CYCLE[0]);
    expect(DAY_QUOTA_CYCLE[0]).toBe(2);
  });

  it('delivers each day of the 9-day cycle its exact quota, then repeats from day 10', () => {
    let state = freshState();
    for (let day = 0; day < 12; day++) {
      const { finalState, injections } = runSwipes(state, DAY_WINDOW_SIZE, true, dateStr(day));
      const expectedQuota = quotaForCycleDay(day);
      expect(injections.filter(Boolean).length).toBe(expectedQuota);
      state = finalState;
    }
    // Day 9 (index 8) and day 10 (index 9, wraps to index 0) should match days 0 and... day 9 index8=2, day10 index0=2 too.
    expect(quotaForCycleDay(8)).toBe(2);
    expect(quotaForCycleDay(9)).toBe(quotaForCycleDay(0));
  });

  it('never reveals past the first DAY_WINDOW_SIZE swipes of a day, even with a nonzero quota', () => {
    // Day index 0 has quota 2 - swipe well past the 20-swipe window and confirm
    // nothing fires beyond swipe 20.
    const { injections } = runSwipes(freshState(), DAY_WINDOW_SIZE + 15, true, dateStr(0));
    const revealsAfterWindow = injections.slice(DAY_WINDOW_SIZE).filter(Boolean);
    expect(revealsAfterWindow.length).toBe(0);
  });

  it('gives a zero-quota day no reveals at all', () => {
    // Day index 3 (the 4th entry) is 0 in the schedule. Start the cycle on
    // day 0, then advance the state's clock straight to day 3 and confirm
    // that day's swipes produce zero reveals.
    expect(DAY_QUOTA_CYCLE[3]).toBe(0);
    const started: LikeBackCycleState = { ...freshState(), hasStarted: true, cycleStartDateStr: dateStr(0), currentDayStr: dateStr(0) };
    const { injections } = runSwipes(started, DAY_WINDOW_SIZE, true, dateStr(3));
    expect(injections.every((v) => v === false)).toBe(true);
  });

  it('rolls over to the next day\'s quota exactly at the day boundary', () => {
    const { finalState: afterDay0 } = runSwipes(freshState(), DAY_WINDOW_SIZE, true, dateStr(0));
    expect(afterDay0.currentDayStr).toBe(dateStr(0));

    const { finalState: afterDay1, injections: day1Injections } = runSwipes(afterDay0, DAY_WINDOW_SIZE, true, dateStr(1));
    expect(afterDay1.currentDayStr).toBe(dateStr(1));
    expect(day1Injections.filter(Boolean).length).toBe(quotaForCycleDay(1));
  });

  it('never reveals within 3 swipes of another reveal on the same day', () => {
    for (let trial = 0; trial < 25; trial++) {
      const { injections } = runSwipes(freshState(), DAY_WINDOW_SIZE, true, dateStr(0));
      const revealSwipeNumbers = injections
        .map((v, idx) => (v ? idx + 1 : null))
        .filter((v): v is number => v !== null);
      for (let i = 1; i < revealSwipeNumbers.length; i++) {
        expect(revealSwipeNumbers[i] - revealSwipeNumbers[i - 1]).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('never under-delivers a day\'s quota across many trials', () => {
    for (let trial = 0; trial < 100; trial++) {
      const { injections } = runSwipes(freshState(), DAY_WINDOW_SIZE, true, dateStr(0));
      expect(injections.filter(Boolean).length).toBe(DAY_QUOTA_CYCLE[0]);
    }
  });
});

describe('planDayOffsets', () => {
  it('returns distinct, in-range, minimum-gap-respecting offsets', () => {
    for (let trial = 0; trial < 50; trial++) {
      const offsets = planDayOffsets(2).sort((a, b) => a - b);
      expect(offsets.length).toBe(2);
      expect(new Set(offsets).size).toBe(2);
      offsets.forEach((o) => {
        expect(o).toBeGreaterThanOrEqual(1);
        expect(o).toBeLessThanOrEqual(DAY_WINDOW_SIZE);
      });
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i] - offsets[i - 1]).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('returns nothing for a zero quota', () => {
    expect(planDayOffsets(0)).toEqual([]);
  });
});

describe('quotaForCycleDay', () => {
  it('matches the requested 9-day schedule', () => {
    expect(DAY_QUOTA_CYCLE).toEqual([2, 1, 1, 0, 1, 0, 0, 1, 2]);
    for (let i = 0; i < 9; i++) {
      expect(quotaForCycleDay(i)).toBe(DAY_QUOTA_CYCLE[i]);
    }
    // Wraps around after day 9.
    expect(quotaForCycleDay(9)).toBe(DAY_QUOTA_CYCLE[0]);
    expect(quotaForCycleDay(17)).toBe(DAY_QUOTA_CYCLE[8]);
  });
});
