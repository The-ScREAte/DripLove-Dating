import { describe, expect, it } from 'vitest';
import { displayFavorites, parseFavorites } from '../favorites';
import { VIBE_CATEGORY, getVibe, hasShared, normalizeText, sanitizeArtist, sharedVibe, withMusic, withVibe } from '../vibe';
import { buildFavorites } from '@/components/onboarding/optionalFields';
import { initialFormData } from '../formData';

describe('vibe storage inside favorites', () => {
  it('stores values + genres in ONE reserved entry and never counts it toward the favorites cap', () => {
    const base = parseFavorites([{ category: 'Movies' }, { category: 'Sports' }, { category: 'Art' }]);
    const next = withVibe(base, { values: ['honesty', 'humor'], genres: ['afrobeats'] });
    expect(next).toHaveLength(4);
    // round-trips through the parser (jsonb) without losing the vibe entry even with 3 other favorites
    const parsed = parseFavorites(JSON.parse(JSON.stringify(next)));
    expect(parsed).toHaveLength(4);
    expect(displayFavorites(parsed)).toHaveLength(3);
    expect(parsed[parsed.length - 1]?.category).toBe(VIBE_CATEGORY);
    expect(getVibe(parsed)).toMatchObject({ values: ['honesty', 'humor'], genres: ['afrobeats'] });
  });
  it('drops unknown ids and clears the entry when empty', () => {
    expect(getVibe([{ category: VIBE_CATEGORY, values: ['honesty', 'made_up'], genres: ['nope'] }])).toMatchObject({ values: ['honesty'], genres: [] });
    expect(withVibe([{ category: VIBE_CATEGORY, values: ['honesty'] }], { values: [] })).toEqual([]);
  });
  it('caps picks at 5 and de-duplicates', () => {
    const next = withVibe([], { values: ['honesty', 'honesty', 'loyalty', 'humor', 'kindness', 'respect', 'faith'] });
    expect(getVibe(next).values).toHaveLength(5);
  });
  it('adds artists + a playable link to the Music favorite, sanitising text and rejecting bad links', () => {
    const next = withMusic([], { artists: ['  <b>Burna Boy</b> ', 'Burna  Boy', 'Wizkid', '', 'Tems', 'Extra'], link: 'https://open.spotify.com/track/xyz' });
    expect(next).toEqual([{ category: 'Music', topArtists: ['Burna Boy', 'Wizkid', 'Tems'], link: 'https://open.spotify.com/track/xyz' }]);
    expect(withMusic([], { link: 'javascript:alert(1)' })).toEqual([]);
    expect(withMusic([], { link: 'http://evil.example/x' })).toEqual([]);
  });
  it('sanitizeArtist strips markup and bounds length', () => {
    expect(sanitizeArtist('<script>x</script>Drake')).not.toContain('<');
    expect(sanitizeArtist('a'.repeat(200))).toHaveLength(60);
  });
  it('normalizeText ignores case, accents and punctuation', () => {
    expect(normalizeText('  Beyoncé!! ')).toBe('beyonce');
  });
});

describe('sharedVibe', () => {
  const viewer = {
    interests: ['Travel', 'Music'],
    favorites: [
      { category: VIBE_CATEGORY, values: ['honesty', 'family'], genres: ['afrobeats', 'rnb'] },
      { category: 'Music', topArtists: ['Burna Boy', 'Tems'] },
    ],
  };
  it('finds what two people share (case/accent-insensitive) and shows the other persons values', () => {
    const other = {
      interests: ['travel', 'Cooking'],
      favorites: [
        { category: VIBE_CATEGORY, values: ['family', 'humor'], genres: ['rnb', 'jazz'] },
        { category: 'Music', topArtists: ['BURNA BOY'] },
      ],
    };
    const s = sharedVibe(viewer, other);
    expect(s).toEqual({ interests: ['travel'], values: ['family'], genres: ['rnb'], artists: ['BURNA BOY'] });
    expect(hasShared(s)).toBe(true);
  });
  it('is empty when nothing is shared or either side is missing', () => {
    expect(hasShared(sharedVibe(viewer, { interests: ['Gaming'], favorites: [] }))).toBe(false);
    expect(hasShared(sharedVibe(null, viewer))).toBe(false);
  });
});

describe('onboarding save: buildFavorites', () => {
  it('returns undefined when every vibe field was skipped (a skip never touches stored data)', () => {
    expect(buildFavorites({ ...initialFormData })).toBeUndefined();
  });
  it('merges new vibe into existing favorites without losing them', () => {
    const out = buildFavorites({
      ...initialFormData,
      favorites: [{ category: 'Movies' }],
      values: ['honesty'],
      musicGenres: ['jazz'],
      musicArtists: ['Tems'],
      musicLink: '',
    });
    expect(out?.some((f) => f.category === 'Movies')).toBe(true);
    expect(getVibe(out)).toMatchObject({ values: ['honesty'], genres: ['jazz'], artists: ['Tems'] });
  });
  it('only values filled: keeps existing genres', () => {
    const existing = withVibe([], { genres: ['soul'] });
    const out = buildFavorites({ ...initialFormData, favorites: existing, values: ['faith'] });
    expect(getVibe(out)).toMatchObject({ values: ['faith'], genres: ['soul'] });
  });
});
