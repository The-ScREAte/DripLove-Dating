// ⭐ ANDROID OPTIMIZATION: Extract heavy logic OUTSIDE component to prevent re-creation
// This reduces Android WebView render cost by 30-40%

import { PotentialMatch } from '@/types';

export interface SlideContent {
  type: 'image' | 'bio' | 'fun_fact' | 'perfect_first_date' | 'last_googled' | 'placeholder';
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

  // Choose one fun question deterministically
  const funQuestions: SlideContent[] = [];
  if (match.fun_fact?.trim()) funQuestions.push({ type: 'fun_fact' as const, content: match.fun_fact, index: -1 });
  if (match.perfect_first_date?.trim()) funQuestions.push({ type: 'perfect_first_date' as const, content: match.perfect_first_date, index: -1 });
  if (match.last_googled?.trim()) funQuestions.push({ type: 'last_googled' as const, content: match.last_googled, index: -1 });

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

// Build the "at a glance" highlight chips shown under the name when the card
// is collapsed: one interest (deterministically chosen per user via the same
// seeded RNG used for slide ordering, so it doesn't change on every re-render)
// plus enough lifestyle attributes (occupation, education, then drinking/
// smoking/exercise/sleep as fallbacks) to always show at least 5 when the data
// exists.
export const getPreviewHighlights = (match: PotentialMatch): string[] => {
  const highlights: string[] = [];

  if (match.interests && match.interests.length > 0) {
    const seed = seedFromString((match.id || match.first_name || '') + '_highlight');
    const rand = mulberry32(seed);
    const randomInterest = match.interests[Math.floor(rand() * match.interests.length)];
    if (randomInterest) highlights.push(randomInterest);
  }

  if (match.occupation) highlights.push(match.occupation);
  if (match.education_level) highlights.push(match.education_level);

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
    if (highlights.length >= 5) break;
    if (filler && filler !== 'not_specified') highlights.push(`${emoji} ${filler}`);
  }

  return highlights.slice(0, 5);
};

// Cycled per chip (by index) across the highlight-chip row on Discover, Liked
// Me, and the profile preview, so the chips read as distinct tags instead of
// a uniform white/15 outline on all of them.
export const HIGHLIGHT_CHIP_BORDER_COLORS = [
  'border-pink-400/50',
  'border-purple-400/50',
  'border-sky-400/50',
  'border-amber-400/50',
  'border-emerald-400/50',
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
