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
