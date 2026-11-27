import { describe, it, expect } from 'vitest';
import { teaserBucketLabel, teaserDisplay } from '../circleCounts';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import fr from '@/i18n/locales/fr.json';
import pt from '@/i18n/locales/pt.json';
import de from '@/i18n/locales/de.json';
import ar from '@/i18n/locales/ar.json';
import sw from '@/i18n/locales/sw.json';
import zh from '@/i18n/locales/zh.json';

const LOCALES = { en, es, fr, pt, de, ar, sw, zh } as Record<string, { circle?: Record<string, string> }>;

describe('locked-tile pill shows ONLY the compact count', () => {
  it('exact when under 10 (no "+"), bucketed with "+" otherwise', () => {
    expect(teaserBucketLabel(3)).toBe('3');
    expect(teaserBucketLabel(7)).toBe('7');
    expect(teaserBucketLabel(20)).toBe('20+');
    expect(teaserBucketLabel(150)).toBe('150+');
    expect(teaserBucketLabel(850)).toBe('850+');
    expect(teaserBucketLabel(2143)).toBe('2.1k+');
    expect(teaserBucketLabel(15_800)).toBe('15.8k+');
    for (const n of [3, 7, 20, 150, 850, 2143, 15_800]) {
      expect(teaserBucketLabel(n)).not.toMatch(/waiting|people/i);
    }
  });
  it('unavailable count -> vague pill (no digits), real zero -> no pill', () => {
    expect(teaserDisplay(null)).toEqual({ label: null, vague: true });
    expect(teaserDisplay(0)).toEqual({ label: null, vague: false });
  });
});

describe('circle copy in all 8 locales', () => {
  for (const [lng, data] of Object.entries(LOCALES)) {
    it(`${lng}: has the short pill strings and no "waiting" pill string`, () => {
      const c = data.circle ?? {};
      expect(c.many && c.many.length).toBeGreaterThan(0);
      expect(c.members && c.members.length).toBeGreaterThan(0);
      expect(c.worldwideHint && c.pickCountries).toBeTruthy();
      expect('people' in c).toBe(false);
      expect('waiting' in c).toBe(false);
      expect('waitingMany' in c).toBe(false);
      // the sheet sentence is now a MEMBER COUNT line (the number is shown big above it), not "waiting for you"
      expect(c.unlockTitle).toContain('{{circle}}');
      expect(c.unlockTitleMany).toContain('{{circle}}');
    });
  }
});
