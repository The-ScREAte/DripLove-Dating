import { describe, expect, it } from 'vitest';
import { applyCompatibilityWeighting, computeCompatibilityScore } from '../matchScoring';
import { VIBE_CATEGORY } from '@/constants/vibe';

const vibe = (values: string[], genres: string[] = [], artists: string[] = []) => [
  { category: VIBE_CATEGORY, values, genres },
  ...(artists.length ? [{ category: 'Music', topArtists: artists }] : []),
];

describe('values + music in compatibility scoring', () => {
  it('cold start: nothing set on either side => no score (skipped, never zero)', () => {
    expect(computeCompatibilityScore({}, {}, undefined)).toBeNull();
    expect(computeCompatibilityScore({ favorites: vibe(['honesty']) }, {}, undefined)).toBeNull();
  });
  it('one side unset => the values/music components are skipped, not penalised', () => {
    const withInterests = computeCompatibilityScore({ interests: ['a', 'b'], favorites: vibe(['honesty']) }, { interests: ['a', 'b'] }, undefined);
    expect(withInterests).toBe(1); // only interests fired, identical
  });
  it('full values overlap scores 1, partial overlap in between, none 0', () => {
    const v = { favorites: vibe(['honesty', 'family', 'humor']) };
    expect(computeCompatibilityScore(v, { favorites: vibe(['honesty', 'family', 'humor']) }, undefined)).toBe(1);
    const partial = computeCompatibilityScore(v, { favorites: vibe(['honesty', 'faith', 'growth']) }, undefined)!;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    expect(computeCompatibilityScore(v, { favorites: vibe(['faith']) }, undefined)).toBe(0);
  });
  it('music: genres count more than artists; artists compare case/accent-insensitively without duplicates', () => {
    const a = { favorites: vibe([], ['afrobeats', 'rnb'], ['Burna Boy', 'burna boy']) };
    const sameGenresNoArtists = { favorites: vibe([], ['afrobeats', 'rnb'], ['Drake']) };
    const sameArtistsNoGenres = { favorites: vibe([], ['jazz', 'rock'], ['BURNA BOY']) };
    const g = computeCompatibilityScore(a, sameGenresNoArtists, undefined)!;
    const ar = computeCompatibilityScore(a, sameArtistsNoGenres, undefined)!;
    expect(g).toBeGreaterThan(ar);
    expect(ar).toBeGreaterThan(0);
  });
  it('music only compares genres when only genres exist on both sides', () => {
    expect(computeCompatibilityScore({ favorites: vibe([], ['jazz']) }, { favorites: vibe([], ['jazz']) }, undefined)).toBe(1);
  });
  it('no single signal can dominate: perfect values cannot outweigh zero interests+music+personality by more than its weight share', () => {
    const viewer = { interests: ['a'], favorites: vibe(['honesty'], ['jazz']) };
    const cand = { interests: ['z'], favorites: vibe(['honesty'], ['rock']) };
    const s = computeCompatibilityScore(viewer, cand, undefined)!;
    // values 1 (w .30), interests 0 (w .40), music 0 (w .15) => .30 / .85
    expect(s).toBeCloseTo(0.3 / 0.85, 5);
  });
  it('is robust to junk favorites shapes', () => {
    expect(() => computeCompatibilityScore({ favorites: 'x' }, { favorites: [null, 5, {}] }, undefined)).not.toThrow();
  });
  it('re-buckets the deck: shared-vibe profile lands in the high bucket ahead of an unrelated one', () => {
    const viewer = { interests: ['a'], favorites: vibe(['honesty', 'family'], ['afrobeats']) };
    const good = { id: 'good', interests: ['a'], favorites: vibe(['honesty', 'family'], ['afrobeats']) };
    const bad = { id: 'bad', interests: ['x'], favorites: vibe(['fun'], ['classical']) };
    const out = applyCompatibilityWeighting([bad, good], viewer, {}, 'seed');
    expect(out[0].id).toBe('good');
  });
});
