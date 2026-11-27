import { describe, it, expect } from 'vitest';
import { shouldShowSplash, ORDINARY_DAY_GAP_MS, localDay } from '../splashPolicy';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const rec = (date: Date, season: 'default' | 'christmas' | 'newyear' = 'default') => ({ at: date.getTime(), day: localDay(date), season });

describe('shouldShowSplash', () => {
  it('shows on the very first launch', () => {
    expect(shouldShowSplash({ now: at(2026, 6, 10), season: 'default', last: null })).toBe(true);
  });
  it('ordinary days: at most once every 3 days', () => {
    const last = rec(at(2026, 6, 10));
    expect(shouldShowSplash({ now: at(2026, 6, 11), season: 'default', last })).toBe(false);
    expect(shouldShowSplash({ now: at(2026, 6, 12, 11), season: 'default', last })).toBe(false);
    expect(shouldShowSplash({ now: new Date(last.at + ORDINARY_DAY_GAP_MS), season: 'default', last })).toBe(true);
  });
  it('holidays: once per calendar day', () => {
    const last = rec(at(2026, 12, 25, 9), 'christmas');
    expect(shouldShowSplash({ now: at(2026, 12, 25, 20), season: 'christmas', last })).toBe(false);
    expect(shouldShowSplash({ now: at(2026, 12, 26, 8), season: 'christmas', last })).toBe(true);
  });
  it('a new season shows even on the same day', () => {
    const last = rec(at(2026, 12, 31, 9), 'christmas');
    expect(shouldShowSplash({ now: at(2026, 12, 31, 20), season: 'newyear', last })).toBe(true);
  });
  it('a holiday shows after an ordinary-day splash earlier that day', () => {
    expect(shouldShowSplash({ now: at(2026, 12, 25, 9), season: 'christmas', last: rec(at(2026, 12, 25, 8)) })).toBe(true);
  });
  it('a preview (?season=) always shows; a clock set back shows too', () => {
    const last = rec(at(2026, 6, 10));
    expect(shouldShowSplash({ now: at(2026, 6, 10, 13), season: 'default', last, forced: true })).toBe(true);
    expect(shouldShowSplash({ now: at(2026, 6, 1), season: 'default', last })).toBe(true);
  });
});
