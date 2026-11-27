import type { initialFormData } from '@/constants/formData';

export type OnboardingMode = 'register' | 'complete';

export type OnboardingFormData = typeof initialFormData;

export type ImageStatus = 'uploading' | 'moderating' | 'approved' | 'pending' | 'rejected';

export interface ImageUpload {
  file: File | null;
  preview: string;
  status: ImageStatus;
  hash?: string; // for duplicate detection
  // Set once this photo has already been uploaded + moderated (checked live,
  // right after picking) - final submit uses these to skip re-uploading and
  // re-running moderation, and just fixes up image_order.
  imageId?: string;
  filePath?: string;
  moderationMessage?: string;
}

export type StepId =
  // ---- required flow ----
  | 'account' // email + password (sign-up only)
  | 'you' // name, date of birth, gender
  | 'looking' // who you're looking for (+ relationship intent)
  | 'location'
  | 'work' // required when completing a profile, a bonus step in sign-up
  | 'signs' // required in sign-up, a bonus step when completing a profile
  | 'face'
  | 'photos'
  // ---- the "You're in!" moment between the two flows ----
  | 'celebrate'
  // ---- bonus mini-flow: every screen is skippable ----
  | 'bio'
  | 'details'
  | 'lifestyle'
  | 'interests'
  | 'values' // what matters most in a relationship
  | 'music' // genres + favorite artists + optional share link
  | 'love';

export type StepErrors = Record<string, string>;
