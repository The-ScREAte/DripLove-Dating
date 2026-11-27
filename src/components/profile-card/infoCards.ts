// The "info cards" that sit between a profile's photos on the swipe card (and on Liked Me,
// the preview, Circle and the chat profile view - they all build their slides through
// MatchCardHelpers.buildSlides, so this is the ONE implementation).
//
// This file is PURE: it turns a profile (+ who is looking) into a ranked list of structured
// cards. Rendering/translation lives in discover/InfoCardSlide.tsx. Nothing here ever emits
// "null" / "undefined" / "not specified" - a field that carries no information is skipped.

import type { PotentialMatch } from '@/types';
import { PETS_OPTIONS } from '@/constants/profileTraits';
import { FREE_OPENER_IDS } from '@/utils/icebreaker';
import { findFavoriteWithLink } from '@/constants/favorites';
import { getVibe, sharedVibe, hasShared } from '@/constants/vibe';
import { isPlayableMusicLink } from '@/utils/musicLink';
import { mulberry32, seedFromString, seededShuffle } from '@/utils/seededRandom';
import { asList, displayValue, isSpecified, toTitleCase, traitText } from './profileCardUtils';

export type InfoCardKind =
  | 'hero'
  | 'about'
  | 'prompt'
  | 'interests'
  | 'values'
  | 'music'
  | 'lifestyle'
  | 'trust'
  | 'starter'
  | 'welcome';

/** An interest / value / genre / artist; the renderer turns it into an emoji + localised label. */
export interface ChipRef {
  type: 'interest' | 'value' | 'genre' | 'artist';
  id: string;
}

export interface InfoCardData {
  name?: string;
  age?: number | null;
  city?: string;
  country?: string;
  verified?: boolean;
  intent?: string;
  /** About bio / prompt answer. */
  text?: string;
  promptType?: 'fun_fact' | 'perfect_first_date' | 'last_googled';
  facts?: Array<{ key: 'work' | 'education' | 'height' | 'place' | 'distance' | 'languages'; value: string }>;
  chips?: ChipRef[];
  extra?: number;
  artists?: string[];
  musicLink?: string;
  musicShared?: boolean;
  traits?: Array<{ key: string; value: string }>;
  activity?: 'now' | 'today' | 'week' | null;
  /** Up to 3 opener ideas (distinct bases), best first. */
  starters?: Array<{ basis: 'interest' | 'value' | 'music' | 'city' | 'generic' | 'free'; value?: string }>;
  distanceKm?: number | null;
  countryCode?: string;
  /** Break the ice: who this card is about (starter / welcome cards only). */
  userId?: string;
  photoUrl?: string;
  isOwn?: boolean;
}

export interface InfoCard {
  kind: InfoCardKind;
  /** Stable content signature (kind + hash of data) - SlideRenderer's memo compares on it. */
  key: string;
  /** Index into CARD_PALETTES. */
  palette: number;
  data: InfoCardData;
}

// ---------------------------------------------------------------------------
// Palettes - brand pink/magenta/violet + warm accents. EVERY stop is dark enough for white
// text at >= 4.5:1 (WCAG 1.4.3); infoCards.test.ts computes the ratios.
// ---------------------------------------------------------------------------
export interface CardPalette {
  name: string;
  from: string;
  to: string;
  glow: string;
}

export const CARD_PALETTES: CardPalette[] = [
  { name: 'rose', from: '#BE185D', to: '#500724', glow: 'rgba(244,114,182,0.38)' },
  { name: 'magenta', from: '#A21CAF', to: '#3B0764', glow: 'rgba(232,121,249,0.34)' },
  { name: 'violet', from: '#6D28D9', to: '#1E1B4B', glow: 'rgba(167,139,250,0.36)' },
  { name: 'coral', from: '#B2360A', to: '#4C0519', glow: 'rgba(251,191,36,0.30)' },
  { name: 'wine', from: '#9F1239', to: '#2E1065', glow: 'rgba(251,113,133,0.34)' },
  { name: 'ocean', from: '#1D4ED8', to: '#1E1B4B', glow: 'rgba(96,165,250,0.34)' },
  { name: 'plum', from: '#86198F', to: '#431407', glow: 'rgba(251,191,36,0.26)' },
];

/** Two palette choices per card kind; which one a profile gets is seeded so decks vary. */
const KIND_PALETTES: Record<InfoCardKind, [number, number]> = {
  hero: [0, 1],
  about: [1, 0],
  prompt: [2, 6],
  interests: [3, 6],
  values: [0, 3],
  music: [2, 1],
  lifestyle: [5, 2],
  trust: [5, 1],
  starter: [1, 2],
  welcome: [3, 0],
};

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);

/** WCAG contrast of white (optionally at `alpha`, blended over the stop) on a #rrggbb colour. */
export const contrastWithWhite = (bg: string, alpha = 1): number => {
  const b = hex(bg);
  const fg = b.map((c) => alpha * 1 + (1 - alpha) * c);
  const l1 = luminance(fg);
  const l2 = luminance(b);
  return (l1 + 0.05) / (l2 + 0.05);
};

// ---------------------------------------------------------------------------
// Context + tuning
// ---------------------------------------------------------------------------
export interface CardContext {
  viewerId?: string | null;
  viewerInterests?: unknown;
  viewerFavorites?: unknown;
  /** The earned verified badge shown on the caption (falls back to profile.is_verified). */
  verified?: boolean;
  distanceKm?: number | null;
  hasPhotos: boolean;
  /** Overrides "today" (tests). */
  now?: number;
}

/** At most 4 swipeable text cards per profile INCLUDING the Break the ice card (so 3 info cards + Break the ice). */
export const MAX_INFO_CARDS = 4;
export const MIN_INFO_CARDS = 3;
const MAX_CHIPS = 12;


const cardKey = (kind: InfoCardKind, data: InfoCardData) => `${kind}:${seedFromString(JSON.stringify(data)).toString(36)}`;

const makeCard = (kind: InfoCardKind, data: InfoCardData, profileSeed: string): InfoCard => {
  const pair = KIND_PALETTES[kind];
  const palette = pair[seedFromString(`${profileSeed}|${kind}`) & 1];
  return { kind, key: cardKey(kind, data), palette, data };
};

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

const activityOf = (lastLogin: string | null | undefined, now: number): InfoCardData['activity'] => {
  if (!lastLogin) return null;
  const t = Date.parse(lastLogin);
  if (!Number.isFinite(t)) return null;
  const age = now - t;
  if (age < 0 || age < 15 * 60 * 1000) return 'now';
  if (age < 24 * 3600 * 1000) return 'today';
  if (age < 7 * 24 * 3600 * 1000) return 'week';
  return null;
};

const ageOf = (dob: string | null | undefined, now: number): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const n = new Date(now);
  let age = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
};

interface Ranked {
  rank: number;
  card: InfoCard;
}

/**
 * Every card this profile can show, ranked (lower = earlier). Ranking: shared things first,
 * then their own words (about / prompt), then the facts, with a small seeded jitter inside
 * the fact tier so two bare-ish profiles do not get an identical deck.
 */
export function buildInfoCards(match: PotentialMatch, ctx: CardContext): InfoCard[] {
  const now = ctx.now ?? Date.now();
  const seed = String(match.id || match.first_name || '');
  const rand = mulberry32(seedFromString(`${seed}|tier`));
  const jitter = () => rand() * 2.5;
  const name = toTitleCase(match.first_name) || '';
  const vibe = getVibe(match.favorites);
  const interests = asList(match.interests).filter((v): v is string => typeof v === 'string' && !!clean(v)).map(clean);
  const cities = [clean(match.city), clean(match.country)].filter(Boolean);
  const ranked: Ranked[] = [];
  const add = (rank: number, kind: InfoCardKind, data: InfoCardData) => ranked.push({ rank, card: makeCard(kind, data, seed) });

  // 1. What you have in common - no card of its own, but it personalises the Break the ice openers
  const own = !!ctx.viewerId && ctx.viewerId === match.id;
  let sharedChips: ChipRef[] = [];
  let sharedMusic = false;
  if (!own) {
    const s = sharedVibe({ interests: ctx.viewerInterests, favorites: ctx.viewerFavorites }, match);
    if (hasShared(s)) {
      sharedChips = [
        ...s.interests.map((id) => ({ type: 'interest' as const, id })),
        ...s.values.map((id) => ({ type: 'value' as const, id })),
        ...s.genres.map((id) => ({ type: 'genre' as const, id })),
        ...s.artists.map((id) => ({ type: 'artist' as const, id })),
      ];
      sharedMusic = s.genres.length + s.artists.length > 0;
    }
  }

  // 2. Their own words
  const bio = clean(match.bio);
  if (bio) {
    // Two quick facts under the quote so a short bio never floats in a void.
    const aboutFacts: NonNullable<InfoCardData['facts']> = [];
    if (isSpecified(match.occupation)) aboutFacts.push({ key: 'work', value: clean(match.occupation) });
    if (cities.length > 0) aboutFacts.push({ key: 'place', value: cities.join(', ') });
    add(2, 'about', { name, text: match.bio.trim().slice(0, 700), facts: aboutFacts.slice(0, 2) });
  }

  const prompts: Array<[NonNullable<InfoCardData['promptType']>, string]> = [];
  if (clean(match.fun_fact)) prompts.push(['fun_fact', match.fun_fact!.trim()]);
  if (clean(match.perfect_first_date)) prompts.push(['perfect_first_date', match.perfect_first_date!.trim()]);
  if (clean(match.last_googled)) prompts.push(['last_googled', match.last_googled!.trim()]);
  if (prompts.length > 0) {
    // One prompt normally; two when there is no bio so a quiet profile still has words.
    const pick = seededShuffle(prompts, mulberry32(seedFromString(`${seed}|prompt`)));
    pick.slice(0, bio ? 1 : 2).forEach(([promptType, text], i) => add(3 + i * 0.1, 'prompt', { name, promptType, text: text.slice(0, 400) }));
  }

  // 5. Interests / values / music
  if (interests.length > 0) {
    const shown = interests.slice(0, MAX_CHIPS);
    add(6 + jitter(), 'interests', { name, chips: shown.map((id) => ({ type: 'interest' as const, id })), extra: Math.max(0, interests.length - shown.length) });
  }
  if (vibe.values.length > 0) {
    add(7 + jitter(), 'values', { name, chips: vibe.values.map((id) => ({ type: 'value' as const, id })) });
  }
  const link = findFavoriteWithLink(match.favorites)?.link;
  const playable = link && isPlayableMusicLink(link) ? link : undefined;
  if (vibe.genres.length > 0 || vibe.artists.length > 0 || playable) {
    add(8 + jitter(), 'music', {
      name,
      chips: vibe.genres.map((id) => ({ type: 'genre' as const, id })),
      artists: vibe.artists.slice(0, 3),
      musicLink: playable,
      musicShared: sharedMusic,
    });
  }

  // 6. Lifestyle (only worth a card with 2+ facts)
  const life: NonNullable<InfoCardData['traits']> = [];
  if (isSpecified(match.exercise_level)) life.push({ key: 'exercise', value: displayValue(match.exercise_level) });
  if (isSpecified(match.drinking)) life.push({ key: 'drinking', value: displayValue(match.drinking) });
  if (isSpecified(match.smoking)) life.push({ key: 'smoking', value: displayValue(match.smoking) });
  if (isSpecified(match.sleeping_schedule)) life.push({ key: 'sleep', value: displayValue(match.sleeping_schedule) });
  for (const v of asList(match.pets).filter((x): x is string => typeof x === 'string')) life.push({ key: 'pets', value: traitText(PETS_OPTIONS, v) });
  if (life.length >= 2) add(9 + jitter(), 'lifestyle', { name, traits: life.slice(0, 6) });

  // 8. Trust
  const verified = ctx.verified ?? !!match.is_verified;
  const activity = activityOf(match.last_login_at, now);
  if (verified || activity) {
    // "Active this week" alone is thin - it only earns a card when there is nothing better.
    const thin = !verified && activity === 'week';
    add(thin ? 12.9 : 11 + jitter(), 'trust', { name, verified, activity });
  }

  // 9. Conversation starters (always available - the generic opener needs only a name)
  type Starter = NonNullable<InfoCardData['starters']>[number];
  const sharedInterest = sharedChips.find((c) => c.type === 'interest');
  const sharedValue = sharedChips.find((c) => c.type === 'value');
  const options: Starter[] = [];
  if (sharedInterest) options.push({ basis: 'interest', value: sharedInterest.id });
  if (sharedValue) options.push({ basis: 'value', value: sharedValue.id });
  if (interests.length > 0) options.push({ basis: 'interest', value: interests[Math.floor(rand() * interests.length)] });
  if (vibe.values.length > 0) options.push({ basis: 'value', value: vibe.values[0] });
  if (vibe.genres.length > 0 || vibe.artists.length > 0) options.push({ basis: 'music' });
  if (clean(match.city)) options.push({ basis: 'city', value: clean(match.city) });
  const starters: Starter[] = [];
  // up to two personal openers (best first), then free-style ones so every deck has something playful
  for (const o of options) {
    if (starters.length >= 2) break;
    if (!starters.some((x) => x.basis === o.basis)) starters.push(o);
  }
  const free = seededShuffle([...FREE_OPENER_IDS], rand);
  for (const id of free) {
    if (starters.length >= 3) break;
    starters.push({ basis: 'free', value: id });
  }
  if (starters.length < 3) starters.push({ basis: 'generic' });
  const starterCard = makeCard('starter', { name, starters, userId: match.id || undefined, photoUrl: match.images?.[0] || undefined, isOwn: !!ctx.viewerId && ctx.viewerId === match.id }, seed);

  // 10. Bare profile? A friendly "new here" card so there is always something warm to read.
  if (ranked.length < MIN_INFO_CARDS - 1) {
    add(11.5, 'welcome', { name, userId: match.id || undefined, photoUrl: match.images?.[0] || undefined, isOwn: !!ctx.viewerId && ctx.viewerId === match.id, age: ageOf(match.date_of_birth, now), city: clean(match.city) || undefined, intent: isSpecified(match.relationship_intent) ? match.relationship_intent : undefined });
  }

  ranked.sort((a, b) => a.rank - b.rank);
  const top = ranked.slice(0, MAX_INFO_CARDS - 1).map((r) => r.card);
  return [...top, starterCard];
}

/** The lead card for a profile with NO photos: a big "Meet {name}" with a monogram. */
export function buildHeroCard(match: PotentialMatch, ctx: CardContext): InfoCard {
  const now = ctx.now ?? Date.now();
  const seed = String(match.id || match.first_name || '');
  return makeCard(
    'hero',
    {
      name: toTitleCase(match.first_name) || '',
      text: `${(match.first_name || '').trim().charAt(0)}${(match.last_name || '').trim().charAt(0)}`.toUpperCase(),
      age: ageOf(match.date_of_birth, now),
      city: clean(match.city) || undefined,
      country: clean(match.country) || undefined,
      intent: isSpecified(match.relationship_intent) ? match.relationship_intent : undefined,
      verified: ctx.verified ?? !!match.is_verified,
    },
    seed,
  );
}

/**
 * Card order for a profile with no photos: hero first (added by the caller), then the cards in an
 * order that is random per (profile, viewer, day) but stable within the session.
 */
export function orderCardsForNoPhotos(cards: InfoCard[], seedParts: { profileId: string; viewerId?: string | null; day: string }): InfoCard[] {
  const rand = mulberry32(seedFromString(`${seedParts.profileId}|${seedParts.viewerId ?? ''}|${seedParts.day}`));
  return seededShuffle(cards, rand);
}

/** Spread `cards` evenly in the gaps after each photo: P C C P C C P ... (first slide stays a photo). */
export function interleavePhotosAndCards<P, C>(photos: P[], cards: C[]): Array<{ photo: P } | { card: C }> {
  if (photos.length === 0) return cards.map((card) => ({ card }));
  const out: Array<{ photo: P } | { card: C }> = [];
  const gaps: C[][] = photos.map(() => []);
  cards.forEach((card, i) => {
    const gap = Math.min(photos.length - 1, Math.floor((i * photos.length) / Math.max(cards.length, 1)));
    gaps[gap].push(card);
  });
  photos.forEach((photo, i) => {
    out.push({ photo });
    gaps[i].forEach((card) => out.push({ card }));
  });
  return out;
}
