// ⭐ ANDROID OPTIMIZATION: Extract heavy logic OUTSIDE component to prevent re-creation
// This reduces Android WebView render cost by 30-40%

import { PotentialMatch } from '@/types';
import {
  FAMILY_PLANS_OPTIONS,
  COMMUNICATION_STYLE_OPTIONS,
  LOVE_STYLE_OPTIONS,
  PETS_OPTIONS,
  SOCIAL_MEDIA_OPTIONS,
  traitLabel,
} from '@/constants/profileTraits';
import { FAVORITE_CATEGORY_EMOJI, DEFAULT_FAVORITE_EMOJI, displayFavorites } from '@/constants/favorites';

import type { InfoCard } from '../profile-card/infoCards';
import {
  buildHeroCard,
  buildInfoCards,
  interleavePhotosAndCards,
  orderCardsForNoPhotos,
} from '../profile-card/infoCards';
import { getViewerVibe } from '@/utils/viewerVibe';
import { dayKey, mulberry32, seedFromString, seededShuffle } from '@/utils/seededRandom';

// Re-exported so every existing import keeps working (the implementations moved to utils/seededRandom).
export { mulberry32, seedFromString, seededShuffle };

export interface SlideContent {
  /** 'image' = a photo (content = url); 'card' = a designed info card (see profile-card/infoCards). */
  type: 'image' | 'card' | 'placeholder';
  /** Photo url, or the card's stable key. */
  content: string;
  index: number;
  card?: InfoCard;
}

/** Who is looking at the profile - drives "You both like", sign compatibility and the no-photo order. */
export interface SlideViewer {
  id?: string | null;
  interests?: unknown;
  favorites?: unknown;
  signs?: string[];
  /** The earned verified badge shown on the caption. */
  verified?: boolean;
  distanceKm?: number | null;
}

// Build the slide deck: photos interleaved with designed info cards.
//  - Photo profiles: the first slide is always a photo; cards are ranked by relevance (shared
//    things, their own words, facts...) and spread evenly in the gaps between photos.
//  - No photos: a "Meet {name}" hero card leads, "You both like" follows, and the rest are in an
//    order that is random per (profile, viewer, day) but stable within the session.
// Every profile gets at least a couple of cards, even a bare one (see buildInfoCards).
export const buildSlides = (
  match: PotentialMatch,
  userImages: string[],
  viewer?: SlideViewer
): SlideContent[] => {
  // Guard against undefined userImages
  if (!userImages || !Array.isArray(userImages)) {
    return [{ type: 'placeholder' as const, content: '', index: -1 }];
  }

  const v: SlideViewer = viewer ?? (() => {
    const g = getViewerVibe();
    return { id: g.id, interests: g.interests, favorites: g.favorites };
  })();
  const photos = userImages.filter((u) => typeof u === 'string' && u.length > 0);
  const ctx = {
    viewerId: v.id ?? null,
    viewerInterests: v.interests,
    viewerFavorites: v.favorites,
    viewerSigns: v.signs,
    verified: v.verified,
    distanceKm: v.distanceKm,
    hasPhotos: photos.length > 0,
  };

  const toSlide = (card: InfoCard): SlideContent => ({ type: 'card' as const, content: card.key, index: -1, card });
  let cards = buildInfoCards(match, ctx);

  if (photos.length === 0) {
    cards = orderCardsForNoPhotos(cards, { profileId: String(match.id || match.first_name || ''), viewerId: v.id, day: dayKey() });
    return [toSlide(buildHeroCard(match, ctx)), ...cards.map(toSlide)];
  }

  const imageSlides: SlideContent[] = photos.map((image, index) => ({ type: 'image' as const, content: image, index }));
  return interleavePhotosAndCards(imageSlides, cards.map(toSlide)).map((e) => ('photo' in e ? e.photo : e.card));
};

// Reads a numeric 0-100 personality slider as a plain-language chip. Each
// slider has no dedicated options list (unlike family_plans etc), so the
// label is derived directly from which half of the scale the value falls on.
const personalitySliderLabel = (
  value: number | undefined,
  low: string,
  high: string,
  emoji: string
): string | undefined => {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  return `${emoji} ${value < 50 ? low : high}`;
};

// Builds the full pool of "at a glance" candidates for a profile - every
// interest, plus occupation/education, languages, personality sliders,
// relationship/family/communication/love-style traits, pets, a favorite (with
// or without a share link), and lifestyle fillers. Not all of these are shown
// at once - getPreviewHighlights below draws a handful out of this pool.
const buildHighlightPool = (match: PotentialMatch): string[] => {
  const pool: string[] = [];

  // DB json columns can hold unexpected shapes (e.g. {} instead of []) - a
  // non-array must never crash the card, so everything list-like is checked.
  if (Array.isArray(match.interests)) pool.push(...match.interests);
  if (match.occupation) pool.push(match.occupation);
  if (match.education_level) pool.push(match.education_level);
  if (Array.isArray(match.languages)) pool.push(...match.languages.map((lang) => `🗣️ ${lang}`));

  if (Array.isArray(match.favorites)) {
    for (const fav of displayFavorites(match.favorites)) {
      const emoji = FAVORITE_CATEGORY_EMOJI[fav.category] || DEFAULT_FAVORITE_EMOJI;
      pool.push(fav.detail ? `${emoji} ${fav.detail}` : `${emoji} ${fav.category}`);
    }
  }

  const traitFillers: (string | undefined)[] = [
    personalitySliderLabel(match.introvert_extrovert, 'Introvert', 'Extrovert', '🌙'),
    personalitySliderLabel(match.spontaneous_planner, 'Planner', 'Spontaneous', '🎲'),
    personalitySliderLabel(match.messy_organized, 'Organized', 'Messy', '🧹'),
    match.family_plans ? traitLabel(FAMILY_PLANS_OPTIONS, match.family_plans) : undefined,
    ...(match.communication_style || []).map((v) => traitLabel(COMMUNICATION_STYLE_OPTIONS, v)),
    ...(match.love_style || []).map((v) => `💗 ${traitLabel(LOVE_STYLE_OPTIONS, v)}`),
    ...(match.pets || []).map((v) => `🐾 ${traitLabel(PETS_OPTIONS, v)}`),
    match.social_media ? traitLabel(SOCIAL_MEDIA_OPTIONS, match.social_media) : undefined,
    // relationship_intent is intentionally excluded here - it already gets its
    // own dedicated "looking for" line elsewhere in the collapsed card, so
    // including it here would just duplicate it (and as an unformatted raw
    // value, not the nice label formatRelationshipIntent produces).
  ];
  pool.push(...traitFillers.filter((v): v is string => !!v));

  // Prefixed with an emoji (instead of a text label) so a bare "no"/"yes"/
  // "occasionally" answer still makes sense on its own in a chip, without
  // spending as many characters as a written-out label like "Exercise:" would.
  const lifestyleFillers: [string, string | undefined][] = [
    ['🏋️', match.exercise_level],
    ['🍸', match.drinking],
    ['🚬', match.smoking],
    ['😴', match.sleeping_schedule],
  ];
  for (const [emoji, filler] of lifestyleFillers) {
    if (filler && filler !== 'not_specified') pool.push(`${emoji} ${filler}`);
  }

  // De-dupe while preserving first occurrence (e.g. same value surfacing via
  // two different fields).
  return Array.from(new Set(pool));
};

// Build the "at a glance" highlight chips shown under the name when the card
// is collapsed. Draws a handful of attributes from the full profile (not just
// education/occupation), paging through a per-profile shuffled deck as
// `variant` (the current photo/slide index) advances, so tapping through
// photos reveals a fresh, non-overlapping set of traits each time - a
// personality trait, language, hobby, favorite, whatever - instead of the
// same two fields, or the same handful reshuffled and re-shown out of order.
// Only repeats once every field in the pool has already been shown once.
export const getPreviewHighlights = (match: PotentialMatch, variant: number = 0): string[] => {
  const pool = buildHighlightPool(match);
  const total = pool.length;
  if (total === 0) return [];

  // Shuffle once per profile (not per variant) so paging through it below
  // advances through disjoint chunks instead of re-randomizing every tap.
  const seed = seedFromString(`${match.id || match.first_name || ''}_highlight`);
  const rand = mulberry32(seed);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Non-wrapping pages of 4: page 0 is items [0-3], page 1 is [4-7], etc, so
  // nothing repeats until every item has appeared once and the cycle restarts
  // from page 0 - no overlap between consecutive pages like a modulo-wrapped
  // window would produce once `total` isn't a clean multiple of the page size.
  const pageSize = 4;
  const pageCount = Math.ceil(total / pageSize);
  const pageIndex = variant % pageCount;
  const startIdx = pageIndex * pageSize;
  return shuffled.slice(startIdx, startIdx + pageSize);
};

// Cycled per chip (by index) across the highlight-chip row on Discover, Liked
// Me, and the profile preview. Kept within the pink family (rather than mixing
// in purple/sky/amber/emerald) so low-opacity borders never wash out into a
// whitish outline against the chip's bg-white/10 fill — still enough shade
// variation to read as distinct tags.
export const HIGHLIGHT_CHIP_BORDER_COLORS = [
  'border-pink-400/60',
  'border-pink-500/50',
  'border-rose-400/60',
  'border-fuchsia-400/50',
  'border-pink-300/50',
];

// Progressively drops later highlight chips on narrower phones instead of
// wrapping them to a second line or squeezing everything down to
// unreadable text - the first couple of chips (generally the most relevant,
// since getPreviewHighlights orders interest-then-occupation-then-education
// first) always show; a device has to be wide enough before the 3rd, 4th,
// and 5th chip earn their spot. The sign chip is deliberately exempt from
// this (always shown alongside) since it's a single compact badge, not a
// variable-width text pill.
// Shortens a highlight-chip label so it never runs into the pill's rounded
// corners the way CSS text-overflow: ellipsis does (and neither Chromium nor
// WebKit support a custom ellipsis string, so ".." can't be done in pure CSS
// anyway) - cut manually and always end in exactly two dots, not the native
// three-dot "…" glyph.
export const truncateChipLabel = (text: string, maxLength = 14): string => {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 2).trimEnd()}..`;
};

// Hash function for generating consistent colors
export const getUserColorHash = (userId: string | undefined, colors: string[]): string => {
  if (!userId) return colors[0];
  let hash = 0;
  const str = userId.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
};
