/**
 * Rating engine - pure decision logic (no DOM, no storage, no network).
 *
 * Store rules this is built around (verified Nov 2026, see the research notes):
 *  - Apple 5.6.1: use the provided API to ask for reviews; custom review
 *    prompts are disallowed. Google Play In-App Review: no opinion question
 *    ("Do you like the app?") before the card; no rewards for ratings.
 *  => We never show our own question or offer a reward. At a genuine happy
 *     moment, after a short afterglow, the app calls the NATIVE review API
 *     directly. Everything here is only about choosing the right moment.
 */

export type MomentType =
  | 'conversation_milestone' // both people sent >= 3 messages
  | 'match_celebrated' // a match screen just closed
  | 'circle_call_completed'
  | 'streak_milestone' // 7 / 14 / 30 day login streak
  | 'verification_success'
  | 'likes_milestone'
  | 'profile_complete';

export type NegativeType =
  | 'error_toast' // a destructive toast was shown
  | 'out_of_swipes' // user hit the swipe limit (frustration)
  | 'payment_failed'
  | 'report_or_block';

export interface RatingState {
  v: 3;
  firstSeenAt: number;
  sessions: number;
  moments: { type: MomentType; at: number }[];
  negatives: { type: NegativeType; at: number }[];
  /** Timestamps of native review requests we made (best effort: the OS
   *  never says whether its sheet actually appeared). */
  requests: number[];
  /** The user opened the store's write-review page through our Rate card. */
  storeOpenedAt: number | null;
  /** profiles.has_rated_app mirrored locally (set when the user used the
   *  Rate card; legacy "Yes" answers from the old funnel also set it). */
  hasRated: boolean;
}

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

export const RULES = {
  /** Account must be at least this old. */
  minAccountAgeMs: 3 * DAY,
  /** App launches before we may ask. */
  minSessions: 4,
  /** A single moment with at least this weight can trigger an ask... */
  triggerWeight: 3,
  /** ...if the weighted happy score over the last 30 days is at least this. */
  minHappyScore: 5,
  happyWindowMs: 30 * DAY,
  /** Min gap between our native requests (Google quota is "less than a
   *  month"; Apple allows 3 / 365 days). */
  minGapMs: 45 * DAY,
  /** Stricter than the OS caps so we never look spammy. */
  maxRequestsPerYear: 3,
  /** After a negative event, stay quiet for: */
  negativeQuietMs: {
    error_toast: 2 * HOUR,
    out_of_swipes: 12 * HOUR,
    payment_failed: 7 * DAY,
    report_or_block: 24 * HOUR,
  } as Record<NegativeType, number>,
  /** Wait after the happy moment ends before the native sheet appears. */
  afterglowMs: 2500,
} as const;

export const MOMENT_WEIGHT: Record<MomentType, number> = {
  conversation_milestone: 4,
  match_celebrated: 3,
  circle_call_completed: 3,
  streak_milestone: 3,
  verification_success: 2,
  likes_milestone: 2,
  profile_complete: 1,
};

/** Has this user already rated (or opened the store's review page through our card)? Shared by the engine and the Rate card. */
export const hasUserRated = (state: Pick<RatingState, 'hasRated' | 'storeOpenedAt'>): boolean =>
  state.hasRated || state.storeOpenedAt !== null;

export const emptyState = (now: number): RatingState => ({
  v: 3,
  firstSeenAt: now,
  sessions: 0,
  moments: [],
  negatives: [],
  requests: [],
  storeOpenedAt: null,
  hasRated: false,
});

/** Drop entries that can no longer affect any decision. */
export const pruneState = (state: RatingState, now: number): RatingState => ({
  ...state,
  moments: state.moments.filter((m) => now - m.at <= RULES.happyWindowMs),
  negatives: state.negatives.filter((n) => now - n.at <= 8 * DAY),
  requests: state.requests.filter((t) => now - t <= 400 * DAY),
});

export interface RatingContext {
  /** Capacitor native app (iOS/Android). The web build never asks. */
  native: boolean;
  /** profiles.created_at if known; falls back to firstSeenAt. */
  accountCreatedAt?: number | null;
  /** Typing, finger down, dialog open, tab hidden, offline, in a flow. */
  busy: boolean;
}

export interface Decision {
  ask: boolean;
  reason: string;
}

const no = (reason: string): Decision => ({ ask: false, reason });

export const happyScore = (state: RatingState, now: number): number =>
  state.moments
    .filter((m) => now - m.at <= RULES.happyWindowMs)
    .reduce((sum, m) => sum + MOMENT_WEIGHT[m.type], 0);

/**
 * Should we call the native review API right now?
 * `trigger` is the moment that just happened (omit to evaluate in general).
 */
export const evaluateRating = (
  state: RatingState,
  now: number,
  ctx: RatingContext,
  trigger?: MomentType
): Decision => {
  if (!ctx.native) return no('web');
  if (hasUserRated(state)) return no('already_rated');

  const createdAt = ctx.accountCreatedAt ?? state.firstSeenAt;
  if (now - createdAt < RULES.minAccountAgeMs) return no('account_too_new');
  if (state.sessions < RULES.minSessions) return no('too_few_sessions');

  for (const n of state.negatives) {
    if (now - n.at < RULES.negativeQuietMs[n.type]) return no(`negative_${n.type}`);
  }

  const yearAgo = now - 365 * DAY;
  const recent = state.requests.filter((t) => t >= yearAgo);
  if (recent.length >= RULES.maxRequestsPerYear) return no('yearly_cap');
  const last = state.requests.length ? Math.max(...state.requests) : null;
  if (last !== null && now - last < RULES.minGapMs) return no('too_soon');

  if (trigger && MOMENT_WEIGHT[trigger] < RULES.triggerWeight) return no('weak_moment');
  if (happyScore(state, now) < RULES.minHappyScore) return no('not_happy_enough');
  if (ctx.busy) return no('busy');

  return { ask: true, reason: 'happy_moment' };
};
