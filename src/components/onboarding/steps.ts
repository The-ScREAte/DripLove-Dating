import { getDateOfBirthError } from '@/utils/formValidation';
import { isPlayableMusicLink } from '@/utils/musicLink';
import type { ImageUpload, OnboardingFormData, OnboardingMode, StepErrors, StepId } from './types';

/** Photos needed to finish. */
export const MIN_PHOTOS = 2;

/** Per-mode photo cap (sign-up has always allowed 5, complete-profile 7). */
export const MAX_PHOTOS: Record<OnboardingMode, number> = { register: 5, complete: 7 };

/** Minimum cultural signs required in sign-up. */
export const MIN_SIGNS = 1;

/** Needed to finish: enough to match on. */
export const MIN_INTERESTS = 3;
export const MIN_VALUES = 1;

/** Most interests a profile can list (same cap the Profile screen enforces). */
export const MAX_INTERESTS_PICKED = 10;
/** Most languages offered in onboarding. */
export const MAX_LANGUAGES_PICKED = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const MIN_PASSWORD = 6;

const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com',
};
/** A suggested fix for a common mistyped email domain (gmial.com), or null. */
export function emailTypoFix(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const fixed = DOMAIN_TYPOS[email.slice(at + 1).toLowerCase()];
  return fixed ? `${email.slice(0, at)}@${fixed}` : null;
}

/** "Your vibe": interests + what matters most are required (they feed matching); music is optional. */
export const VIBE_STEPS: StepId[] = ['interests', 'values', 'music'];
/** The rest of the always-skippable extras in the bonus mini-flow. */
export const BONUS_STEPS: StepId[] = ['bio', 'details', 'lifestyle', 'love'];

/**
 * The ordered steps for a flow:  required screens -> 'celebrate' -> bonus screens.
 *
 * - The account step only exists for sign-up, and only until the account exists
 *   (a resumed registration already has one).
 * - Work is required when completing a profile but a bonus screen in sign-up;
 *   cultural signs are the other way round - exactly the rules the two original
 *   forms had.
 */
export function getSteps(mode: OnboardingMode, hasAccount: boolean): StepId[] {
  const required: StepId[] = [];
  const bonus: StepId[] = [];
  if (mode === 'register' && !hasAccount) required.push('account');
  required.push('you', 'looking', 'location');
  required.push('signs', 'face', 'photos');
  // Vibe first (it powers matching), then the screens that were required in the other flow, then the rest.
  bonus.push(...VIBE_STEPS);
  bonus.push('work', ...BONUS_STEPS);
  return [...required, 'celebrate', ...bonus];
}

/** Split a step list at the celebration into its two flows. */
export function splitFlows(steps: StepId[]): { required: StepId[]; bonus: StepId[] } {
  const i = steps.indexOf('celebrate');
  if (i === -1) return { required: steps, bonus: [] };
  return { required: steps.slice(0, i), bonus: steps.slice(i + 1) };
}

export type Phase = 'main' | 'celebrate' | 'bonus';

export function phaseOf(steps: StepId[], step: StepId): Phase {
  if (step === 'celebrate') return 'celebrate';
  return splitFlows(steps).bonus.includes(step) ? 'bonus' : 'main';
}

/**
 * How far along the bar is, 0..1. The main bar counts REQUIRED screens only
 * (optional questions never make the flow feel longer) and reaches 100% at the
 * celebration; the bonus flow has its own small bar.
 */
export function progressFraction(steps: StepId[], step: StepId): number {
  const { required, bonus } = splitFlows(steps);
  const phase = phaseOf(steps, step);
  if (phase === 'celebrate') return 1;
  if (phase === 'bonus') return bonus.length ? (bonus.indexOf(step) + 1) / bonus.length : 1;
  return required.length ? (required.indexOf(step) + 1) / (required.length + 1) : 1;
}

export type CheerKey = 'start' | 'great' | 'almost' | 'last';

/**
 * Which short encouragement (if any) to show when someone moves forward INTO the
 * required screen at `index` of `total`. Escalates with progress and stays quiet
 * in between: start (2nd screen) -> great (middle) -> almost (second to last) ->
 * last (final required screen). Priority on collisions: last > almost > start > great.
 */
export function cheerKey(index: number, total: number): CheerKey | null {
  if (index <= 0 || total < 3 || index >= total) return null;
  if (index === total - 1) return 'last';
  if (index === total - 2 && index > 1) return 'almost';
  if (index === 1) return 'start';
  if (index === Math.floor(total / 2)) return 'great';
  return null;
}

/** Visual phase groups (for the small hearts burst when you move into a new one). */
export function phaseGroup(step: StepId): number {
  switch (step) {
    case 'account':
    case 'you':
    case 'looking':
      return 1;
    case 'location':
    case 'work':
    case 'signs':
      return 2;
    case 'face':
    case 'photos':
      return 3;
    case 'celebrate':
      return 4;
    default:
      return 5;
  }
}

/**
 * Required screens whose data is already on file, so a person who signed in with
 * Google or Apple (or is resuming a profile) only sees what's left.
 * Complete-profile only: sign-up starts from nothing. Face and photos count once
 * verified / saved.
 */
export function knownStepIds(mode: OnboardingMode, f: OnboardingFormData, faceVerified: boolean, photoCount: number): StepId[] {
  if (mode !== 'complete') return [];
  const known: StepId[] = [];
  if (f.firstName.trim() && f.lastName.trim() && f.dateOfBirth && !getDateOfBirthError(f.dateOfBirth) && f.gender) known.push('you');
  if (f.preference && f.relationshipIntent) known.push('looking');
  if (f.city.trim()) known.push('location');
  if (f.occupation && f.industry && f.educationLevel) known.push('work');
  if (f.adinkraSymbols.length > 0) known.push('signs');
  if (f.interests.length >= MIN_INTERESTS) known.push('interests');
  if (f.values.length >= MIN_VALUES) known.push('values');
  if (faceVerified) known.push('face');
  if (photoCount >= MIN_PHOTOS) known.push('photos');
  return known;
}

/** Which rules are mandatory differs a little by flow - kept exactly as the two
 *  original forms had them. */
export function isRequired(step: StepId, mode: OnboardingMode): boolean {
  switch (step) {
    case 'work':
    case 'interests':
    case 'values':
      return true; // they sit after "You're in!" but are needed to finish, in both flows
    case 'signs':
      return true;
    case 'celebrate':
    case 'bio':
    case 'details':
    case 'lifestyle':
    case 'music':
    case 'love':
      return false;
    default:
      return true;
  }
}

/** A bonus screen: skippable, shown after the "You're in!" moment. */
export const isBonusStep = (steps: StepId[], step: StepId): boolean => phaseOf(steps, step) === 'bonus';

export interface StepContext {
  mode: OnboardingMode;
  formData: OnboardingFormData;
  faceVerified: boolean;
  photoCount: number;
  /** translate - only used for the few messages that were already localised */
  t?: (key: string) => string;
}

const tr = (ctx: StepContext, key: string, fallback: string) => {
  const out = ctx.t?.(key);
  return out && out !== key ? out : fallback;
};

export function validateStep(step: StepId, ctx: StepContext): StepErrors {
  const { formData: f, mode } = ctx;
  const e: StepErrors = {};

  switch (step) {
    case 'account': {
      if (!f.email.trim()) e.email = 'Email is required';
      else if (!EMAIL_RE.test(f.email.trim())) e.email = 'Please enter a valid email address (e.g., name@domain.com)';
      else {
        const fix = emailTypoFix(f.email.trim());
        if (fix) e.email = `Did you mean ${fix}?`;
      }
      if (!f.password) e.password = 'Password is required';
      else if (f.password.length < MIN_PASSWORD) e.password = 'Password must be at least 6 characters long';
      if (!f.confirmPassword) e.confirmPassword = 'Please confirm your password';
      else if (f.password !== f.confirmPassword) e.confirmPassword = "Passwords don't match";
      break;
    }
    case 'you': {
      if (!f.firstName.trim()) e.firstName = 'First name is required';
      if (!f.lastName.trim()) e.lastName = 'Last name is required';
      if (!f.dateOfBirth) e.dateOfBirth = 'Date of birth is required';
      else {
        const dob = getDateOfBirthError(f.dateOfBirth);
        if (dob) e.dateOfBirth = dob;
      }
      if (!f.gender) e.gender = 'Gender is required';
      break;
    }
    case 'looking': {
      if (!f.preference) e.preference = 'Preference is required';
      if (!f.relationshipIntent) e.relationshipIntent = 'Relationship intent is required';
      break;
    }
    case 'location': {
      // Country is optional (Apple's guidelines); a city is what matters.
      if (!f.city.trim()) e.city = 'City is required';
      break;
    }
    case 'work': {
      {
        if (!f.occupation) e.occupation = tr(ctx, 'profileCompletion.errors.occupationRequired', 'Occupation is required');
        if (!f.industry) e.industry = tr(ctx, 'profileCompletion.errors.industryRequired', 'Industry is required');
        if (!f.educationLevel) e.educationLevel = tr(ctx, 'profileCompletion.errors.educationRequired', 'Education level is required');
      }
      break;
    }
    case 'signs': {
      if ((!Array.isArray(f.adinkraSymbols) || f.adinkraSymbols.length < MIN_SIGNS)) {
        e.adinkraSymbols = 'Please select at least one cultural sign';
      }
      break;
    }
    case 'face': {
      if (!ctx.faceVerified) e.faceVerification = 'Face verification is required to continue';
      break;
    }
    case 'photos': {
      if (ctx.photoCount < MIN_PHOTOS) e.images = `Add at least ${MIN_PHOTOS} photos to continue.`;
      break;
    }
    case 'celebrate':
    case 'bio':
    case 'details':
    case 'lifestyle':
    case 'music':
      // The only check: a share link must be one we can actually play (the person can still Skip).
      if (f.musicLink.trim() && !isPlayableMusicLink(f.musicLink)) {
        e.musicLink = tr(ctx, 'onboarding.music.linkInvalid', 'Paste a Spotify, Apple Music, YouTube or SoundCloud link.');
      }
      break;
    case 'interests':
      if (f.interests.length < MIN_INTERESTS) e.interests = `Pick at least ${MIN_INTERESTS} interests.`;
      break;
    case 'values':
      if (f.values.length < MIN_VALUES) e.values = 'Pick at least 1 thing that matters to you.';
      break;
    case 'love':
      // nothing here can ever block finishing
      break;
  }
  return e;
}

/** Validate every step up to and including `through`, returning the first
 *  step that fails (so a final-submit error can jump back to where it's fixable). */
export function firstInvalidStep(
  steps: StepId[],
  ctx: StepContext,
  through: StepId = steps[steps.length - 1],
): { step: StepId; errors: StepErrors } | null {
  const end = steps.indexOf(through);
  for (let i = 0; i <= end; i++) {
    const errors = validateStep(steps[i], ctx);
    if (Object.keys(errors).length > 0) return { step: steps[i], errors };
  }
  return null;
}

export function countSelectablePhotos(images: ImageUpload[]): number {
  return images.filter(
    (img) => (img.status === 'approved' || img.status === 'pending') && (img.imageId || img.file),
  ).length;
}

/** Short reason a primary button is disabled, or null when it's ready. */
export function getPrimaryHint(step: StepId, ctx: StepContext, images: ImageUpload[]): string | null {
  if (step === 'photos') {
    if (images.some((i) => i.status === 'moderating')) return 'Checking your photos…';
    const need = MIN_PHOTOS - ctx.photoCount;
    if (need > 0) return need === 1 ? 'Add 1 more photo' : `Add ${need} more photos`;
  }
  if (step === 'interests') {
    const need = MIN_INTERESTS - ctx.formData.interests.length;
    if (need > 0) return need === 1 ? 'Pick 1 more' : `Pick ${need} more`;
  }
  if (step === 'values' && ctx.formData.values.length < MIN_VALUES) return 'Pick at least 1';
  return null;
}

/** 0 = empty, 1 = too short, 2 = okay, 3 = good, 4 = strong. Hint only - the only hard rule is 6+ chars. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: '' };
  if (password.length < MIN_PASSWORD) return { score: 1, label: 'Too short' };
  let pts = 0;
  if (password.length >= 8) pts++;
  if (password.length >= 12) pts++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) pts++;
  if (/\d/.test(password)) pts++;
  if (/[^A-Za-z0-9]/.test(password)) pts++;
  if (pts >= 4) return { score: 4, label: 'Strong' };
  if (pts >= 2) return { score: 3, label: 'Good' };
  return { score: 2, label: 'Okay' };
}
