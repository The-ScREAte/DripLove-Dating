import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateAge } from '../dateUtils';

afterEach(() => vi.useRealTimers());

const at = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); };

describe('calculateAge', () => {
  it('turns 18 on the birthday exactly (inclusive)', () => {
    at('2026-03-15T12:00:00');
    expect(calculateAge('2008-03-15')).toBe(18);
    expect(calculateAge('2008-03-16')).toBe(17);
  });
  it('leap-day birthdays count up on Mar 1 in non-leap years', () => {
    at('2027-02-28T12:00:00');
    expect(calculateAge('2000-02-29')).toBe(26);
    at('2027-03-01T12:00:00');
    expect(calculateAge('2000-02-29')).toBe(27);
  });
  it('does not read a bare date as UTC (no off-by-one-day in any timezone)', () => {
    at('2026-03-15T00:30:00');
    expect(calculateAge('2008-03-15')).toBe(18);
  });
  it('returns NaN for garbage', () => {
    expect(Number.isNaN(calculateAge('not-a-date'))).toBe(true);
  });
});
