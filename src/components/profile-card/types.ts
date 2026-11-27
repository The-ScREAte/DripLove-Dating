import type { FavoriteEntry } from '@/constants/favorites';

/**
 * The slice of a profile the shared profile presentation reads. Every field is
 * optional/nullable so Discover (PotentialMatch), Liked Me, the Preview modal
 * and Circle can all pass their own profile shape without conversion.
 */
export interface ProfileCardData {
  id?: string | null;
  first_name?: string | null;
  bio?: string | null;
  occupation?: string | null;
  education_level?: string | null;
  industry?: string | null;
  height_cm?: number | null;
  relationship_intent?: string | null;
  family_plans?: string | null;
  smoking?: string | null;
  drinking?: string | null;
  exercise_level?: string | null;
  sleeping_schedule?: string | null;
  introvert_extrovert?: number | null;
  spontaneous_planner?: number | null;
  messy_organized?: number | null;
  communication_style?: string[] | null;
  love_style?: string[] | null;
  interests?: string[] | null;
  favorites?: FavoriteEntry[] | null;
  pets?: string[] | null;
  languages?: string[] | null;
  social_media?: string | null;
  fun_fact?: string | null;
  perfect_first_date?: string | null;
  last_googled?: string | null;
}

export interface CaptionedPhoto {
  url: string;
  caption: string;
  label: string | null;
}

export type ImageCaptions = Record<string, { label?: string | null; caption?: string | null }>;

/** Where the second captioned photo lands in the expanded panel (always below About). */
export const PHOTO_ANCHORS = ['lifestyle', 'workEducation', 'personality', 'communicationStyle'] as const;
export type PhotoAnchor = (typeof PHOTO_ANCHORS)[number];
