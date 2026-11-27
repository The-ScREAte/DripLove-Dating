/**
 * Single "may we ask right now?" check, used twice: by RatingHost when a happy
 * moment ends (should we even queue the slot?) and by the popup coordinator at
 * show time (is it STILL a good idea?). `busy` is not evaluated here - the
 * coordinator already refuses to show anything while the user is typing,
 * swiping, in a call, onboarding, etc.
 */
import { evaluateRating, type Decision, type MomentType } from './ratingEngine';
import { loadRatingState } from './ratingStore';
import { getRatingAccountCreatedAt } from './ratingMoments';
import { isNativeApp } from './nativeReview';

export const getRatingDecision = (trigger?: MomentType): Decision =>
  evaluateRating(
    loadRatingState(),
    Date.now(),
    { native: isNativeApp(), accountCreatedAt: getRatingAccountCreatedAt(), busy: false },
    trigger
  );

export const isRatingAskAllowed = (trigger?: MomentType): boolean => getRatingDecision(trigger).ask;
