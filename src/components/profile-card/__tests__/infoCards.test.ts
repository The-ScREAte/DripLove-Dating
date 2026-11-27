import { describe, expect, it } from 'vitest';
import type { PotentialMatch } from '@/types';
import {
  CARD_PALETTES,
  MAX_INFO_CARDS,
  buildHeroCard,
  buildInfoCards,
  contrastWithWhite,
  interleavePhotosAndCards,
  orderCardsForNoPhotos,
} from '../infoCards';
import { buildSlides } from '../../discover/MatchCardHelpers';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const base = (over: Partial<PotentialMatch> = {}): PotentialMatch =>
  ({
    id: 'p1', first_name: 'bra', last_name: 'abban', bio: '', city: '', country: '', country_code: '',
    occupation: '', education_level: '', date_of_birth: '1992-03-10', interests: [], images: [], gender: 'male',
    ...over,
  }) as PotentialMatch;

const rich = base({
  bio: "I'm a simple person with a big ambition",
  city: 'Accra', country: 'Ghana', country_code: 'GH',
  occupation: 'Designer', education_level: 'some_college', height_cm: 178, languages: ['English', 'Twi'],
  interests: ['Travel', 'Music', 'Cooking', 'Football'],
  fun_fact: 'I can juggle', perfect_first_date: 'Coffee then a walk',
  relationship_intent: 'serious', family_plans: 'want_children', love_style: ['quality_time'], communication_style: ['big_texter'],
  drinking: 'socially', smoking: 'no', exercise_level: 'often', pets: ['dogs'],
  adinkra_symbols: ['Eban', 'Duafe'], last_login_at: '2026-11-26T11:55:00Z', is_verified: true,
  favorites: [
    { category: 'Vibe', values: ['honesty', 'humor'], genres: ['afrobeats'] },
    { category: 'Music', topArtists: ['Burna Boy'], link: 'https://open.spotify.com/track/abc' },
  ] as never,
});

const ctx = (over = {}) => ({ hasPhotos: true, now: NOW, ...over });
const kinds = (cards: { kind: string }[]) => cards.map((c) => c.kind);

describe('palettes', () => {
  it('every stop passes 4.5:1 with white text (also at the eyebrow alpha)', () => {
    for (const p of CARD_PALETTES) {
      for (const stop of [p.from, p.to]) {
        expect(contrastWithWhite(stop)).toBeGreaterThanOrEqual(4.5);
        expect(contrastWithWhite(stop, 0.84)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('buildInfoCards', () => {
  it('a rich profile gets exactly 4 cards (3 info + Break the ice), ending with the conversation starter', () => {
    const cards = buildInfoCards(rich, ctx());
    expect(MAX_INFO_CARDS).toBe(4);
    expect(cards).toHaveLength(4);
    expect(cards.length).toBeLessThanOrEqual(MAX_INFO_CARDS);
    expect(cards[cards.length - 1].kind).toBe('starter');
    expect(kinds(cards)).toContain('about');
  });

  it('never builds the removed "You both like" / "At a glance" / "Looking for" cards', () => {
    const cards = buildInfoCards(rich, ctx({ viewerId: 'v1', viewerInterests: ['Travel', 'Chess'], viewerFavorites: [{ category: 'Vibe', values: ['honesty'], genres: [] }] }));
    const k = kinds(cards) as string[];
    expect(k).not.toContain('shared');
    expect(k).not.toContain('basics');
    expect(k).not.toContain('looking');
  });

  it('a bare profile (name/age/city only) still gets a welcome card and the Break the ice card', () => {
    const cards = buildInfoCards(base({ city: 'Kumasi', country: 'Ghana' }), ctx());
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(kinds(cards)).toContain('starter');
  });

  it('an even barer profile still gets a friendly welcome + starter', () => {
    const cards = buildInfoCards(base(), ctx());
    expect(kinds(cards)).toEqual(expect.arrayContaining(['welcome', 'starter']));
  });

  it('never leaks null/undefined/not_specified into card text', () => {
    const odd = base({ city: 'Accra', occupation: 'not_specified', education_level: 'not_specified', drinking: 'not_specified', smoking: '  ', relationship_intent: 'not_specified', family_plans: undefined, bio: '   ', interests: [null, undefined, '', 'Art'] as never });
    const json = JSON.stringify([...buildInfoCards(odd, ctx()), buildHeroCard(odd, ctx())]);
    expect(json).not.toMatch(/null|undefined|not_specified|NaN/);
  });

  it('survives wrong-shaped DB columns without throwing', () => {
    const weird = base({ interests: {} as never, favorites: {} as never, languages: 'en' as never, pets: {} as never, adinkra_symbols: 5 as never, communication_style: 'x' as never });
    expect(() => buildInfoCards(weird, ctx())).not.toThrow();
  });

  it('is deterministic for the same inputs', () => {
    const a = buildInfoCards(rich, ctx({ viewerId: 'v1' })).map((c) => c.key);
    const b = buildInfoCards(rich, ctx({ viewerId: 'v1' })).map((c) => c.key);
    expect(a).toEqual(b);
  });

  it('trust card reflects verified + recent activity', () => {
    const trust = buildInfoCards(rich, ctx({ verified: true })).find((c) => c.kind === 'trust');
    if (trust) {
      expect(trust.data.verified).toBe(true);
      expect(trust.data.activity).toBe('now');
    }
  });
});

describe('conversation starters', () => {
  it('offers 1-3 distinct ideas, always ending with a generic opener available', () => {
    const st = buildInfoCards(rich, ctx({ viewerId: 'v1', viewerInterests: ['Travel'] })).find((c) => c.kind === 'starter')!.data.starters!;
    expect(st.length).toBeGreaterThanOrEqual(1);
    expect(st.length).toBeLessThanOrEqual(3);
    expect(new Set(st.map((s) => `${s.basis}:${s.value ?? ''}`)).size).toBe(st.length);
  });
  it('a bare profile still gets three openers (free-style ones fill in)', () => {
    const st = buildInfoCards(base(), ctx()).find((c) => c.kind === 'starter')!.data.starters!;
    expect(st).toHaveLength(3);
    expect(st.filter((s) => s.basis === 'free').length).toBeGreaterThanOrEqual(2);
  });
  it('a rich profile mixes personal openers with at least one free-style one', () => {
    const st = buildInfoCards(rich, ctx({ viewerId: 'v1', viewerInterests: ['Cooking'] })).find((c) => c.kind === 'starter')!.data.starters!;
    expect(st).toHaveLength(3);
    expect(st.some((s) => s.basis === 'free')).toBe(true);
    expect(st.some((s) => s.basis !== 'free')).toBe(true);
  });
  it('leads with something shared when there is overlap', () => {
    const st = buildInfoCards(rich, ctx({ viewerId: 'v1', viewerInterests: ['Cooking'] })).find((c) => c.kind === 'starter')!.data.starters!;
    expect(st[0]).toEqual({ basis: 'interest', value: 'Cooking' });
  });
});

describe('no-photo ordering', () => {
  const cards = buildInfoCards(rich, ctx({ viewerId: 'v1', viewerInterests: ['Travel'] }));
  const order = (day: string, id = 'p1', viewer = 'v1') => orderCardsForNoPhotos(cards, { profileId: id, viewerId: viewer, day }).map((c) => c.key);

  it('is stable for the same profile + viewer + day (no reshuffle on re-render/undo)', () => {
    expect(order('2026-11-26')).toEqual(order('2026-11-26'));
  });
  it('contains every card exactly once', () => {
    const o = order('2026-11-26');
    expect([...o].sort()).toEqual(cards.map((c) => c.key).sort());
  });
  it('varies across profiles/days', () => {
    const variants = new Set([order('2026-11-26', 'a'), order('2026-11-26', 'b'), order('2026-11-27', 'a'), order('2026-11-28', 'a'), order('2026-11-29', 'a')].map((o) => o.join('|')));
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe('interleavePhotosAndCards', () => {
  it('starts with a photo and spreads cards evenly', () => {
    const out = interleavePhotosAndCards(['p0', 'p1', 'p2'], ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']).map((e) => ('photo' in e ? e.photo : e.card));
    expect(out[0]).toBe('p0');
    expect(out).toEqual(['p0', 'c0', 'c1', 'p1', 'c2', 'c3', 'p2', 'c4', 'c5']);
  });
  it('keeps every photo and card (more photos than cards)', () => {
    const out = interleavePhotosAndCards(['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], ['c0', 'c1', 'c2']).map((e) => ('photo' in e ? e.photo : e.card));
    expect(out).toHaveLength(9);
    expect(out[0]).toBe('p0');
  });
  it('single photo: photo first then all the cards', () => {
    const out = interleavePhotosAndCards(['p0'], ['c0', 'c1']).map((e) => ('photo' in e ? e.photo : e.card));
    expect(out).toEqual(['p0', 'c0', 'c1']);
  });
  it('no photos: cards only', () => {
    expect(interleavePhotosAndCards([], ['c0', 'c1'])).toHaveLength(2);
  });
});

describe('buildSlides', () => {
  const viewer = { id: 'v1', interests: ['Travel'], favorites: [] };
  it('photo profile: first slide is a photo, cards are interleaved', () => {
    const s = buildSlides(rich, ['a.jpg', 'b.jpg', 'c.jpg'], viewer);
    expect(s[0].type).toBe('image');
    expect(s.filter((x) => x.type === 'image')).toHaveLength(3);
    expect(s.some((x) => x.type === 'card')).toBe(true);
  });
  it('no photos: a hero card leads and there is no empty placeholder', () => {
    const s = buildSlides(rich, [], viewer);
    expect(s[0].type).toBe('card');
    expect(s[0].card?.kind).toBe('hero');
    expect(s.every((x) => x.type === 'card')).toBe(true);
    expect(s.length).toBeGreaterThanOrEqual(3);
  });
  it('no photos + bare profile still has a hero + cards', () => {
    const s = buildSlides(base({ city: 'Accra' }), [], viewer);
    expect(s[0].card?.kind).toBe('hero');
    expect(s.length).toBeGreaterThanOrEqual(3);
  });
  it('the session order of a photo-less profile does not reshuffle between calls', () => {
    const a = buildSlides(rich, [], viewer).map((x) => x.content);
    const b = buildSlides(rich, [], viewer).map((x) => x.content);
    expect(a).toEqual(b);
  });
  it('a non-array image list degrades to a placeholder, not a crash', () => {
    expect(buildSlides(rich, undefined as never)[0].type).toBe('placeholder');
  });
});
