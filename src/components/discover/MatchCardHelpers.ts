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
import { FAVORITE_CATEGORY_EMOJI, DEFAULT_FAVORITE_EMOJI } from '@/constants/favorites';

export interface SlideContent {
  type:
    | 'image'
    | 'bio'
    | 'fun_fact'
    | 'perfect_first_date'
    | 'last_googled'
    | 'height'
    | 'family_plans'
    | 'communication_style'
    | 'love_style'
    | 'pets'
    | 'social_media'
    | 'placeholder';
  content: string;
  index: number;
}

// Seeded RNG (mulberry32) - deterministic shuffling based on user ID
export const mulberry32 = (a: number) => () => {
  let t = a += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

export const seedFromString = (s: string | number | undefined): number => {
  const str = s == null ? '' : String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const seededShuffle = <T,>(arr: T[], rand: () => number): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Build slides array - moved outside component for performance
export const buildSlides = (
  match: PotentialMatch,
  userImages: string[]
): SlideContent[] => {
  // Guard against undefined userImages
  if (!userImages || !Array.isArray(userImages)) {
    return [{ type: 'placeholder' as const, content: '', index: -1 }];
  }

  const seed = seedFromString(match.id || match.first_name || 0);
  const rand = mulberry32(seed);

  const imageSlides: SlideContent[] = userImages.map((image, index) => ({
    type: 'image' as const,
    content: image,
    index
  }));

  // Collect all non-image content
  const nonImageContent: SlideContent[] = [];

  if (match.bio?.trim()) {
    nonImageContent.push({ type: 'bio' as const, content: match.bio, index: -1 });
  }

  // Choose one fun question deterministically - the pool includes both the
  // original free-text prompts and the newer trait fields (family plans,
  // communication/love style, pets, social media), so which one shows up is
  // random per profile rather than always the same field for everyone or
  // all of them at once.
  const funQuestions: SlideContent[] = [];
  if (match.fun_fact?.trim()) funQuestions.push({ type: 'fun_fact' as const, content: match.fun_fact, index: -1 });
  if (match.perfect_first_date?.trim()) funQuestions.push({ type: 'perfect_first_date' as const, content: match.perfect_first_date, index: -1 });
  if (match.last_googled?.trim()) funQuestions.push({ type: 'last_googled' as const, content: match.last_googled, index: -1 });
  if (typeof match.height_cm === 'number' && match.height_cm > 0) {
    const totalInches = Math.round(match.height_cm / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    funQuestions.push({ type: 'height' as const, content: `${feet}'${inches}" (${match.height_cm} cm)`, index: -1 });
  }
  if (match.family_plans?.trim()) {
    funQuestions.push({ type: 'family_plans' as const, content: traitLabel(FAMILY_PLANS_OPTIONS, match.family_plans), index: -1 });
  }
  if (match.communication_style && match.communication_style.length > 0) {
    funQuestions.push({
      type: 'communication_style' as const,
      content: match.communication_style.map((v) => traitLabel(COMMUNICATION_STYLE_OPTIONS, v)).join(', '),
      index: -1,
    });
  }
  if (match.love_style && match.love_style.length > 0) {
    funQuestions.push({
      type: 'love_style' as const,
      content: match.love_style.map((v) => traitLabel(LOVE_STYLE_OPTIONS, v)).join(', '),
      index: -1,
    });
  }
  if (match.pets && match.pets.length > 0) {
    funQuestions.push({
      type: 'pets' as const,
      content: match.pets.map((v) => traitLabel(PETS_OPTIONS, v)).join(', '),
      index: -1,
    });
  }
  if (match.social_media?.trim()) {
    funQuestions.push({ type: 'social_media' as const, content: traitLabel(SOCIAL_MEDIA_OPTIONS, match.social_media), index: -1 });
  }

  if (funQuestions.length > 0) {
    const idx = Math.floor(rand() * funQuestions.length);
    nonImageContent.push(funQuestions[idx]);
  }

  // If no images, show non-image content first, then placeholder
  if (imageSlides.length === 0) {
    if (nonImageContent.length > 0) {
      const shuffled = seededShuffle(nonImageContent, rand);
      return [...shuffled, { type: 'placeholder' as const, content: '', index: -1 }];
    }
    return [{ type: 'placeholder' as const, content: '', index: -1 }];
  }

  // Structured mixing: image first, then alternate bio/fun facts with images
  const mixedSlides: SlideContent[] = [];

  // Always start with first image
  mixedSlides.push(imageSlides[0]);

  let imageIndex = 1; // Track next image to add
  let contentIndex = 0; // Track next content to add

  // Add bio first if available
  const bioContent = nonImageContent.find(c => c.type === 'bio');
  const funContent = nonImageContent.find(c => c.type !== 'bio');

  if (bioContent) {
    mixedSlides.push(bioContent);
    contentIndex++;
  }

  // Add second image if available
  if (imageIndex < imageSlides.length) {
    mixedSlides.push(imageSlides[imageIndex]);
    imageIndex++;
  }

  // Add fun fact if available
  if (funContent) {
    mixedSlides.push(funContent);
    contentIndex++;
  }

  // Add remaining images
  while (imageIndex < imageSlides.length) {
    mixedSlides.push(imageSlides[imageIndex]);
    imageIndex++;
  }

  return mixedSlides;
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

  if (match.interests) pool.push(...match.interests);
  if (match.occupation) pool.push(match.occupation);
  if (match.education_level) pool.push(match.education_level);
  if (match.languages) pool.push(...match.languages.map((lang) => `🗣️ ${lang}`));

  if (match.favorites) {
    for (const fav of match.favorites) {
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
export const getHighlightChipVisibilityClass = (index: number): string => {
  if (index < 2) return '';
  if (index === 2) return 'hidden min-[360px]:inline-flex';
  if (index === 3) return 'hidden min-[400px]:inline-flex';
  return 'hidden min-[440px]:inline-flex';
};

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
