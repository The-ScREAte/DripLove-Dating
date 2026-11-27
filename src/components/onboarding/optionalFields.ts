import type { FavoriteEntry } from '@/constants/favorites';
import { withMusic, withVibe } from '@/constants/vibe';
import type { OnboardingFormData } from './types';

/**
 * The optional profile details collected in onboarding, as profile columns.
 * Only fields the person actually filled in are included, so skipping a step
 * can never overwrite what's already stored. Same columns/shapes the Profile
 * screen edits.
 */
export function buildOptionalProfileFields(f: OnboardingFormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.heightCm) out.height_cm = f.heightCm;
  if (f.languages.length > 0) out.languages = f.languages;
  if (f.pets.length > 0) out.pets = f.pets;
  if (f.loveStyle.length > 0) out.love_style = f.loveStyle;
  if (f.communicationStyle.length > 0) out.communication_style = f.communicationStyle;
  if (f.familyPlans) out.family_plans = f.familyPlans;
  if (f.socialMedia) out.social_media = f.socialMedia;
  const favorites = buildFavorites(f);
  if (favorites) out.favorites = favorites;
  return out;
}

/**
 * The favorites array to save when the person filled in any vibe field
 * (values, music genres, favorite artists, share link) - or undefined when they
 * skipped them all, so a skip can never touch what's already stored. Existing
 * favorites are carried through unchanged; values + genres go into the reserved
 * Vibe entry and artists + link onto the Music favorite (no schema change).
 */
export function buildFavorites(f: OnboardingFormData): FavoriteEntry[] | undefined {
  const artists = f.musicArtists.map((a) => a.trim()).filter(Boolean);
  const link = f.musicLink.trim();
  const touched = f.values.length > 0 || f.musicGenres.length > 0 || artists.length > 0 || !!link;
  if (!touched) return undefined;
  let next: FavoriteEntry[] = [...(f.favorites ?? [])];
  if (artists.length > 0 || link) next = withMusic(next, { artists, link });
  if (f.values.length > 0 || f.musicGenres.length > 0) {
    next = withVibe(next, {
      values: f.values.length > 0 ? f.values : undefined,
      genres: f.musicGenres.length > 0 ? f.musicGenres : undefined,
    });
  }
  return next;
}
