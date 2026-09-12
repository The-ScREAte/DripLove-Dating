import { describe, it, expect, beforeEach, vi } from 'vitest';

// vitest's default environment is Node, which has no `localStorage` global -
// this module's own try/catch would silently swallow that and make every
// write a no-op, turning this test into a no-op too. A tiny in-memory
// polyfill (rather than pulling in jsdom as a new dependency) gives the real
// module real storage to read and write, so this actually exercises the
// runtime logic instead of just type-checking it.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

const DAY = 24 * 60 * 60 * 1000;

describe('ratingFunnelStorage', () => {
  beforeEach(async () => {
    vi.resetModules();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.clear();
    vi.useRealTimers();
  });

  it('is eligible on a completely fresh account', async () => {
    const { isRatingFunnelEligible } = await import('../ratingFunnelStorage');
    expect(isRatingFunnelEligible()).toBe(true);
  });

  it('becomes ineligible immediately after being shown, and stays that way until the cooldown passes', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.setSystemTime(t0);

    const { isRatingFunnelEligible, markRatingFunnelShown } = await import('../ratingFunnelStorage');

    expect(isRatingFunnelEligible()).toBe(true);
    markRatingFunnelShown();
    expect(isRatingFunnelEligible()).toBe(false);

    // 20 days later - still inside the 21-day base cooldown
    vi.setSystemTime(t0 + 20 * DAY);
    expect(isRatingFunnelEligible()).toBe(false);

    // 22 days later - base cooldown has elapsed
    vi.setSystemTime(t0 + 22 * DAY);
    expect(isRatingFunnelEligible()).toBe(true);
  });

  it('"Not Really" extends the cooldown before the next ask, but never permanently', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.setSystemTime(t0);

    const { isRatingFunnelEligible, markRatingFunnelShown, markRatingFunnelNotNow } = await import(
      '../ratingFunnelStorage'
    );

    markRatingFunnelShown();
    markRatingFunnelNotNow(); // notNowCount = 1 -> cooldown becomes 31 days

    vi.setSystemTime(t0 + 25 * DAY); // past the base 21 days, but not the extended 31
    expect(isRatingFunnelEligible()).toBe(false);

    vi.setSystemTime(t0 + 32 * DAY);
    expect(isRatingFunnelEligible()).toBe(true);
  });

  it('"Yes" is permanent - never eligible again, no matter how much time passes', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.setSystemTime(t0);

    const { isRatingFunnelEligible, markRatingFunnelShown, markRatingFunnelRespondedYes } = await import(
      '../ratingFunnelStorage'
    );

    markRatingFunnelShown();
    markRatingFunnelRespondedYes();

    expect(isRatingFunnelEligible()).toBe(false);

    // A year later, still no.
    vi.setSystemTime(t0 + 365 * DAY);
    expect(isRatingFunnelEligible()).toBe(false);
  });

  it('does NOT mark "responded yes" merely because the app decided to show the prompt (the original bug)', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.setSystemTime(t0);

    const { isRatingFunnelEligible, markRatingFunnelShown } = await import('../ratingFunnelStorage');

    markRatingFunnelShown();
    // No explicit "Yes" was ever recorded - just being shown once should not
    // be permanent; it must become eligible again after the cooldown.
    vi.setSystemTime(t0 + 22 * DAY);
    expect(isRatingFunnelEligible()).toBe(true);
  });

  it('syncing a true has_rated_app from the DB makes the funnel permanently ineligible on this device too', async () => {
    const { isRatingFunnelEligible, syncRatingFunnelFromDb } = await import('../ratingFunnelStorage');

    expect(isRatingFunnelEligible()).toBe(true);
    syncRatingFunnelFromDb(true);
    expect(isRatingFunnelEligible()).toBe(false);
  });

  it('syncing a false has_rated_app from the DB does not clear an existing local "Yes"', async () => {
    const { isRatingFunnelEligible, markRatingFunnelRespondedYes, syncRatingFunnelFromDb } = await import(
      '../ratingFunnelStorage'
    );

    markRatingFunnelRespondedYes();
    expect(isRatingFunnelEligible()).toBe(false);

    syncRatingFunnelFromDb(false);
    expect(isRatingFunnelEligible()).toBe(false);
  });
});
