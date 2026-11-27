import { useMemo } from 'react';
import { mulberry32, seedFromString } from '@/utils/seededRandom';
import {
  PHOTO_ANCHORS,
  type CaptionedPhoto,
  type ImageCaptions,
  type PhotoAnchor,
} from './types';

/** A profile field that actually carries information (not empty, not "not_specified"). */
export const isSpecified = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim() !== '' && value !== 'not_specified';

/** "night_owl" -> "Night owl" (values from the DB can be snake_case identifiers). */
export const displayValue = (value: string): string => {
  const spaced = value.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : spaced;
};

type Translate = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

/** "serious" -> "Looking for something serious" (localised when `t` is given). */
export const relationshipIntentLabel = (intent?: string | null, t?: Translate): string => {
  if (!intent) return '';
  const tr: Translate = t ?? ((_key, defaultValue, options) =>
    defaultValue.replace('{{what}}', String(options?.what ?? '')));
  if (intent === 'serious') return tr('discover.matchCard.lookingForSerious', 'Looking for something serious');
  if (intent === 'open_to_anything') return tr('discover.matchCard.openToAnything', 'Open to anything');
  const what = intent.replace(/_/g, ' ').toLowerCase();
  return tr('discover.matchCard.lookingFor', 'Looking for {{what}}', { what });
};

/** A long bio gets a "Read more" toggle instead of being clipped. */
export const isLongText = (text: string, maxChars = 180, maxLines = 3): boolean =>
  text.length > maxChars || text.split('\n').length > maxLines;

/**
 * Up to 2 of a profile's captioned photos, chosen with a seeded shuffle so the
 * same photos surface for the same profile on every render and every screen.
 * `allowedUrls` limits the pick to photos the viewer can actually see.
 */
export const pickCaptionedPhotos = (
  captions: ImageCaptions | null | undefined,
  seedKey: string,
  allowedUrls?: readonly string[]
): CaptionedPhoto[] => {
  const entries = Object.entries(captions || {})
    .filter(([url, v]) => v?.caption && (!allowedUrls || allowedUrls.includes(url)))
    .map(([url, v]) => ({ url, caption: v!.caption as string, label: v!.label || null }));
  if (entries.length === 0) return [];
  const rand = mulberry32(seedFromString(`${seedKey}_photocaption`));
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 2);
};

/** Which section the second captioned photo follows (seeded per profile). */
export const pickSecondPhotoAnchor = (seedKey: string, photoCount: number): PhotoAnchor | null => {
  if (photoCount < 2) return null;
  const rand = mulberry32(seedFromString(`${seedKey}_photo2anchor`));
  return PHOTO_ANCHORS[Math.floor(rand() * PHOTO_ANCHORS.length)];
};

/** Memoised captioned photos + second-photo anchor for one profile. */
export const useCaptionedPhotos = (
  captions: ImageCaptions | null | undefined,
  seedKey: string,
  allowedUrls?: readonly string[]
) => {
  const captionedPhotos = useMemo(
    () => pickCaptionedPhotos(captions, seedKey, allowedUrls),
    [captions, seedKey, allowedUrls]
  );
  const secondPhotoAnchor = useMemo(
    () => pickSecondPhotoAnchor(seedKey, captionedPhotos.length),
    [seedKey, captionedPhotos.length]
  );
  return { captionedPhotos, secondPhotoAnchor };
};

/** Option label for a stored trait value; unknown values are prettified, never shown raw. */
export const traitText = (
  options: { value: string; label: string }[],
  value: string
): string => options.find((opt) => opt.value === value)?.label || displayValue(value);

/** A list field from the DB, tolerating null / non-array shapes (never throws). */
export function asList<T>(value: readonly T[] | null | undefined): T[];
export function asList(value: unknown): unknown[];
export function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

/** "kofi asante" -> "Kofi Asante". */
export const toTitleCase = (value?: string | null): string => {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
