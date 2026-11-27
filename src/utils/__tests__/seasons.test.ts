import { describe, it, expect } from 'vitest';
import { seasonFor, seasonMessage, easterSunday, thanksgivingDay, festiveKey } from '../seasons';

const on = (y: number, m: number, d: number) => seasonFor(new Date(y, m - 1, d, 12)).id;

describe('seasonFor', () => {
  it('new year around the turn of the year', () => {
    expect(on(2026, 12, 31)).toBe('newyear');
    expect(on(2027, 1, 1)).toBe('newyear');
    expect(on(2027, 1, 3)).toBe('newyear');
    expect(on(2027, 1, 4)).toBe('default');
  });
  it('christmas 18-26 Dec', () => {
    expect(on(2026, 12, 17)).toBe('default');
    expect(on(2026, 12, 18)).toBe('christmas');
    expect(on(2026, 12, 25)).toBe('christmas');
    expect(on(2026, 12, 27)).toBe('default');
  });
  it('thanksgiving follows the 4th Thursday', () => {
    expect(thanksgivingDay(2026)).toBe(26);
    expect(on(2026, 11, 26)).toBe('thanksgiving');
    expect(on(2026, 11, 24)).toBe('thanksgiving');
    expect(on(2026, 11, 23)).toBe('default');
    expect(thanksgivingDay(2027)).toBe(25);
  });
  it('valentine and halloween', () => {
    expect(on(2027, 2, 14)).toBe('valentine');
    expect(on(2027, 2, 15)).toBe('default');
    expect(on(2026, 10, 31)).toBe('halloween');
  });
  it('easter moves every year', () => {
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(on(2027, 3, 26)).toBe('easter');
    expect(on(2027, 3, 29)).toBe('easter');
    expect(on(2027, 3, 30)).toBe('default');
  });
  it('an ordinary day has the default greeting', () => {
    expect(on(2026, 6, 10)).toBe('default');
  });
});

describe('seasonMessage', () => {
  it('is stable within a day and rotates through the lines across days', () => {
    const s = seasonFor(new Date(2026, 11, 25, 12));
    const a = seasonMessage(s, new Date(2026, 11, 25, 8));
    expect(seasonMessage(s, new Date(2026, 11, 25, 22))).toEqual(a);
    const seen = new Set([0, 1, 2].map((d) => seasonMessage(s, new Date(2026, 11, 25 + d, 12)).key));
    expect(seen.size).toBe(3);
  });
});

describe('festiveKey', () => {
  it('is null on an ordinary day and one stable id per festival occurrence', () => {
    expect(festiveKey(new Date(2026, 5, 10))).toBeNull();
    expect(festiveKey(new Date(2026, 11, 24))).toBe('christmas-2026');
    expect(festiveKey(new Date(2026, 11, 26))).toBe('christmas-2026');
    expect(festiveKey(new Date(2026, 10, 26))).toBe('thanksgiving-2026');
  });
  it('new year spanning two calendar years is one occurrence', () => {
    expect(festiveKey(new Date(2026, 11, 31))).toBe('newyear-2027');
    expect(festiveKey(new Date(2027, 0, 2))).toBe('newyear-2027');
  });
});
