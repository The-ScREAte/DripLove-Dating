import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { festivalDue, markFestivalSeen, hasSeenFestival } from '../festive';

describe('festive greeting scheduling', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
    vi.stubGlobal('window', { location: { search: '' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is due on a festival day and not on an ordinary day', () => {
    expect(festivalDue('u1', new Date(2026, 11, 25))).toBe('christmas-2026');
    expect(festivalDue('u1', new Date(2026, 5, 10))).toBeNull();
  });
  it('is due once per person per festival: after it was shown it is not due again, even on another festival day', () => {
    markFestivalSeen('u1', 'christmas-2026');
    expect(hasSeenFestival('u1', 'christmas-2026')).toBe(true);
    expect(festivalDue('u1', new Date(2026, 11, 25))).toBeNull();
    expect(festivalDue('u1', new Date(2026, 11, 26))).toBeNull();
  });
  it('is per person, and a new festival (or the same one next year) is due again', () => {
    markFestivalSeen('u1', 'christmas-2026');
    expect(festivalDue('u2', new Date(2026, 11, 25))).toBe('christmas-2026');
    expect(festivalDue('u1', new Date(2026, 11, 31))).toBe('newyear-2027');
    expect(festivalDue('u1', new Date(2027, 11, 25))).toBe('christmas-2027');
  });
  it('a festival that has passed is never due, so a missed greeting does not appear late', () => {
    expect(festivalDue('u1', new Date(2027, 0, 20))).toBeNull();
  });
  it('survives blocked or corrupted storage', () => {
    store['dl_festive_seen_v1:u1'] = '{{nope';
    expect(festivalDue('u1', new Date(2026, 11, 25))).toBe('christmas-2026');
    expect(() => markFestivalSeen('u1', 'x')).not.toThrow();
  });
});
