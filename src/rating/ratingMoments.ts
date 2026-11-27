/**
 * Public API for the rest of the app - tiny on purpose:
 *
 *   recordRatingMoment('match_celebrated')   // something genuinely good happened
 *   recordRatingNegative('out_of_swipes')    // something frustrating happened
 *
 * Safe to call from anywhere, any time (even before RatingHost mounts, or on
 * web): they only update persisted state and notify the host, which decides
 * whether to ask the popup coordinator (src/popups) to call the native review
 * API. WHEN it can actually appear (never while typing, swiping, in a call,
 * during onboarding...) is the coordinator's job, not ours.
 */
import { loadRatingState, saveRatingState } from './ratingStore';
import { pruneState, type MomentType, type NegativeType, type RatingState } from './ratingEngine';
import { trackRating } from './ratingAnalytics';

type Listener = (trigger: MomentType) => void;
const listeners = new Set<Listener>();

/** The same moment reported twice within this window counts once (e.g. the
 *  match screen and the page behind it both reporting one match). */
const DEDUPE_MS = 60_000;

let accountCreatedAt: number | null = null;
/** RatingHost provides profiles.created_at so eligibility can use account age. */
export const setRatingAccountCreatedAt = (ms: number | null): void => {
  accountCreatedAt = ms;
};
export const getRatingAccountCreatedAt = (): number | null => accountCreatedAt;

export const subscribeRatingMoments = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const mutateRatingState = (fn: (s: RatingState) => RatingState): RatingState => {
  const now = Date.now();
  const next = pruneState(fn(loadRatingState(now)), now);
  saveRatingState(next);
  return next;
};

export const recordRatingMoment = (type: MomentType): void => {
  const now = Date.now();
  const current = loadRatingState(now);
  if (current.moments.some((m) => m.type === type && now - m.at < DEDUPE_MS)) return;
  mutateRatingState((s) => ({ ...s, moments: [...s.moments, { type, at: now }] }));
  trackRating('moment', { type });
  listeners.forEach((fn) => {
    try {
      fn(type);
    } catch {
      // a listener must never break the caller
    }
  });
};

export const recordRatingNegative = (type: NegativeType): void => {
  const now = Date.now();
  mutateRatingState((s) => ({ ...s, negatives: [...s.negatives, { type, at: now }] }));
};
