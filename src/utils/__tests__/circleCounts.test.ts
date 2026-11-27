import { describe, it, expect } from 'vitest';
import {
  dobBoundsForAgeRange,
  formatCountCompact,
  teaserBucketLabel,
  teaserDisplay,
  teaserHues,
  removeFromDeck,
  rollbackInsertIndex,
  prefetchWindow,
  buildCircleCountScope,
} from '../circleCounts';

const parseCompact = (label: string): number => {
  const base = label.endsWith('+') ? label.slice(0, -1) : label;
  if (base.endsWith('M')) return parseFloat(base) * 1_000_000;
  if (base.endsWith('k')) return parseFloat(base) * 1000;
  return parseFloat(base);
};

describe('teaser counts are honest (never above the true count)', () => {
  it('never exceeds the true count, across a wide sweep', () => {
    const samples = [1, 7, 9, 10, 24, 25, 57, 99, 100, 149, 150, 499, 500, 842, 849, 850, 999, 1000, 1049, 1050, 1199, 1999, 2000, 2149, 2150, 9999, 10_000, 15_800, 54_321, 999_999, 1_000_000, 1_234_567];
    for (let n = 1; n <= 20_000; n += 37) samples.push(n);
    for (const n of samples) {
      const label = teaserBucketLabel(n)!;
      expect(parseCompact(label)).toBeLessThanOrEqual(n);
    }
  });
  it('matches the agreed formatting table', () => {
    const table: [number, string][] = [
      [1, '1'], [7, '7'], [9, '9'],
      [10, '10+'], [57, '50+'], [99, '90+'],
      [100, '100+'], [149, '100+'], [150, '150+'], [842, '800+'], [850, '850+'], [999, '950+'],
      [1000, '1k+'], [1049, '1k+'], [1050, '1k+'], [1234, '1.2k+'], [2143, '2.1k+'], [2149, '2.1k+'], [2150, '2.1k+'],
      [9999, '9.9k+'], [10_000, '10k+'], [15_800, '15.8k+'],
      [999_999, '999.9k+'], [1_000_000, '1M+'], [1_234_567, '1.2M+'],
    ];
    for (const [n, label] of table) expect(teaserBucketLabel(n)).toBe(label);
  });
  it('has nothing to advertise for 0 / invalid', () => {
    expect(teaserBucketLabel(0)).toBeNull();
    expect(teaserBucketLabel(-3)).toBeNull();
    expect(teaserBucketLabel(NaN)).toBeNull();
  });
  it('never invents a figure when the true count is unknown', () => {
    expect(teaserDisplay(null)).toEqual({ label: null, vague: true });
    expect(teaserDisplay(1500)).toEqual({ label: '1.5k+', vague: false });
    // a real total of zero is NOT "many": no label and not vague
    expect(teaserDisplay(0)).toEqual({ label: null, vague: false });
  });
});

describe('formatCountCompact', () => {
  it('is exact under 1000 and rounds down above', () => {
    expect(formatCountCompact(0)).toBe('0');
    expect(formatCountCompact(42)).toBe('42');
    expect(formatCountCompact(999)).toBe('999');
    expect(formatCountCompact(1000)).toBe('1k');
    expect(formatCountCompact(1999)).toBe('1.9k');
    expect(formatCountCompact(12_345)).toBe('12.3k');
  });
});

describe('teaserHues', () => {
  it('is deterministic per category+day and has the requested length', () => {
    const a = teaserHues('travel', 4, '2026-11-26');
    expect(a).toEqual(teaserHues('travel', 4, '2026-11-26'));
    expect(a).toHaveLength(4);
    expect(teaserHues('travel', 5, '2026-11-26')).toHaveLength(5);
  });
});

describe('dobBoundsForAgeRange', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  it('maps an age range to an inclusive date-of-birth window', () => {
    expect(dobBoundsForAgeRange(18, 99, now)).toEqual({ latest: '2008-11-26', earliest: '1926-11-27' });
    expect(dobBoundsForAgeRange(25, 35, now)).toEqual({ latest: '2001-11-26', earliest: '1990-11-27' });
  });
  it('turning 18 today is included, turning 100 today is excluded', () => {
    const { earliest, latest } = dobBoundsForAgeRange(18, 99, now);
    expect('2008-11-26' <= latest).toBe(true); // exactly 18 today
    expect('2008-11-27' <= latest).toBe(false); // 17 until tomorrow
    expect('1926-11-26' >= earliest).toBe(false); // 100 today
    expect('1926-11-27' >= earliest).toBe(true); // 99 until tomorrow
  });
});

describe('removeFromDeck keeps the current card stable', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  it('removing someone BEFORE the current card shifts the index with it', () => {
    expect(removeFromDeck(ids, 3, 'b')).toEqual({ ids: ['a', 'c', 'd', 'e'], index: 2, removed: true });
  });
  it('removing the current card leaves the index (the next card slides in)', () => {
    expect(removeFromDeck(ids, 2, 'c')).toEqual({ ids: ['a', 'b', 'd', 'e'], index: 2, removed: true });
  });
  it('removing a later card changes nothing about the index', () => {
    expect(removeFromDeck(ids, 1, 'e')).toEqual({ ids: ['a', 'b', 'c', 'd'], index: 1, removed: true });
  });
  it('is a no-op for someone not in the deck', () => {
    const r = removeFromDeck(ids, 2, 'zzz');
    expect(r.removed).toBe(false);
    expect(r.ids).toBe(ids);
  });
  it('never goes below 0', () => {
    expect(removeFromDeck(['a', 'b'], 0, 'a').index).toBe(0);
  });
});

describe('rollbackInsertIndex / prefetchWindow', () => {
  it('puts a rolled-back person next, clamped to the deck length', () => {
    expect(rollbackInsertIndex(2, 10)).toBe(3);
    expect(rollbackInsertIndex(9, 10)).toBe(10);
    expect(rollbackInsertIndex(10, 10)).toBe(10);
  });
  it('prefetches the next 4: all photos of the first two, the first photo of the rest', () => {
    expect(prefetchWindow(0, 60)).toEqual({ full: [0, 1], first: [2, 3] });
    expect(prefetchWindow(58, 60)).toEqual({ full: [58, 59], first: [] });
    expect(prefetchWindow(3, 4)).toEqual({ full: [3], first: [] });
  });
});

describe('buildCircleCountScope: entire app vs selected countries', () => {
  const prefs = { minAge: 25, maxAge: 40 };

  it('FREE viewer: entire app - NO country, gender, age or distance filter, no hint', () => {
    const s = buildCircleCountScope({ isPremium: false, homeCountry: 'GH', selectedCountries: ['NG'], prefs });
    expect(s).toEqual({ mode: 'worldwide', countryCodes: null, ageRange: null, applyGender: false, applyDistance: false, showCountryHint: false });
  });
  it('FREE viewer ignores any stored selected countries (they only apply once subscribed)', () => {
    expect(buildCircleCountScope({ isPremium: false, homeCountry: 'GH', selectedCountries: ['KE', 'ZA'], prefs }).mode).toBe('worldwide');
  });
  it('PREMIUM with selected countries: home + selected only (upper-cased, de-duplicated), own prefs, distance applies', () => {
    const s = buildCircleCountScope({ isPremium: true, homeCountry: 'GH', selectedCountries: ['ke', 'NG', 'KE', 'GH'], prefs });
    expect(s).toEqual({ mode: 'selected', countryCodes: ['GH', 'KE', 'NG'], ageRange: { min: 25, max: 40 }, applyGender: true, applyDistance: true, showCountryHint: false });
  });
  it('PREMIUM with none selected (or only their home country): entire app + a hint to pick countries', () => {
    for (const selectedCountries of [[], null, undefined, ['GH']]) {
      const s = buildCircleCountScope({ isPremium: true, homeCountry: 'GH', selectedCountries, prefs });
      expect(s.mode).toBe('worldwide');
      expect(s.countryCodes).toBeNull();
      expect(s.ageRange).toBeNull();
      expect(s.showCountryHint).toBe(true);
    }
  });
  it('status still loading (undefined) behaves like free: entire app, no hint', () => {
    const s = buildCircleCountScope({ isPremium: undefined, homeCountry: 'GH', selectedCountries: ['NG'], prefs });
    expect(s.mode).toBe('worldwide');
    expect(s.showCountryHint).toBe(false);
  });
  it('a premium flip or a country change produces a different scope (so cached counts refresh)', () => {
    const free = buildCircleCountScope({ isPremium: false, homeCountry: 'GH', selectedCountries: ['NG'], prefs });
    const prem = buildCircleCountScope({ isPremium: true, homeCountry: 'GH', selectedCountries: ['NG'], prefs });
    const prem2 = buildCircleCountScope({ isPremium: true, homeCountry: 'GH', selectedCountries: ['NG', 'KE'], prefs });
    expect(free).not.toEqual(prem);
    expect(prem).not.toEqual(prem2);
  });
  it('defaults the age range when preferences are missing', () => {
    expect(buildCircleCountScope({ isPremium: true, homeCountry: 'GH', selectedCountries: ['NG'], prefs: {} }).ageRange).toEqual({ min: 18, max: 99 });
  });
});
