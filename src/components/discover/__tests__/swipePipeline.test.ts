import { describe, expect, it } from 'vitest';
import { nextRecoveryDelayMs, refillCooldownMs, shouldPrefetch, shouldResyncSwipeCount, urgentRefillGapMs } from '../swipePipeline';

describe('refill back-off', () => {
  it('starts at 6s and doubles per empty refill up to 60s', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(refillCooldownMs)).toEqual([6000, 12000, 24000, 48000, 60000, 60000, 60000]);
  });
  it('is safe for bad input', () => {
    expect(refillCooldownMs(-3)).toBe(6000);
    expect(refillCooldownMs(1.9)).toBe(12000);
  });
  it('urgent per-swipe refills stay at 1.5s while refills succeed, then back off', () => {
    expect(urgentRefillGapMs(0)).toBe(1500);
    expect(urgentRefillGapMs(1)).toBe(12000);
    expect(urgentRefillGapMs(9)).toBe(60000);
  });
});

describe('empty-state recovery delay', () => {
  it('15s -> 30s -> 60s -> 120s and stays there', () => {
    let d = 15_000;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      d = nextRecoveryDelayMs(d);
      seen.push(d);
    }
    expect(seen).toEqual([30000, 60000, 120000, 120000, 120000, 120000]);
  });
});

describe('daily swipe count re-check (limit reset)', () => {
  const base = { hidden: false, dayChanged: false, outOfSwipes: false, msSinceSync: 0 };
  it('re-reads when the day changed', () => expect(shouldResyncSwipeCount({ ...base, dayChanged: true })).toBe(true));
  it('re-reads while blocked at the limit once a minute has passed', () => {
    expect(shouldResyncSwipeCount({ ...base, outOfSwipes: true, msSinceSync: 61_000 })).toBe(true);
    expect(shouldResyncSwipeCount({ ...base, outOfSwipes: true, msSinceSync: 20_000 })).toBe(false);
  });
  it('does nothing for a normal user mid-day, and never while hidden', () => {
    expect(shouldResyncSwipeCount({ ...base, msSinceSync: 999_999 })).toBe(false);
    expect(shouldResyncSwipeCount({ ...base, hidden: true, dayChanged: true, outOfSwipes: true, msSinceSync: 999_999 })).toBe(false);
  });
});

describe('prefetch gate', () => {
  const ok = { outOfSwipes: false, hasCompletedInitialFetch: true, inFlight: false, noMoreProfiles: false, deckEmpty: false, remainingReal: 20, threshold: 25 };
  it('loads in the background when the deck is getting low', () => expect(shouldPrefetch(ok)).toBe(true));
  it('does not load while the deck is still comfortably full', () => expect(shouldPrefetch({ ...ok, remainingReal: 40 })).toBe(false));
  it('stops when out of daily swipes, while one is in flight, or when exhausted', () => {
    expect(shouldPrefetch({ ...ok, outOfSwipes: true })).toBe(false);
    expect(shouldPrefetch({ ...ok, inFlight: true })).toBe(false);
    expect(shouldPrefetch({ ...ok, noMoreProfiles: true })).toBe(false);
  });
  it('resumes the moment the limit resets', () => {
    expect(shouldPrefetch({ ...ok, outOfSwipes: true })).toBe(false);
    expect(shouldPrefetch({ ...ok, outOfSwipes: false })).toBe(true);
  });
});
