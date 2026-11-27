import { describe, expect, it } from 'vitest';
import {
  DAY,
  HOUR,
  MOMENT_WEIGHT,
  RULES,
  emptyState,
  evaluateRating,
  happyScore,
  pruneState,
  type RatingState,
} from '../ratingEngine';
import { STORAGE_KEY, loadRatingState, saveRatingState, type KV } from '../ratingStore';
import { buildReviewUrls } from '../storeLinks';

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);
const ctx = { native: true, busy: false };

/** A user who has been around, opened the app a lot and just had a great week. */
const happyUser = (over: Partial<RatingState> = {}): RatingState => ({
  ...emptyState(NOW - 30 * DAY),
  sessions: 12,
  moments: [
    { type: 'conversation_milestone', at: NOW - 2 * DAY },
    { type: 'match_celebrated', at: NOW - 1000 },
  ],
  ...over,
});

describe('evaluateRating - eligibility', () => {
  it('asks a tenured, happy user right after a strong moment', () => {
    expect(evaluateRating(happyUser(), NOW, ctx, 'match_celebrated')).toEqual({
      ask: true,
      reason: 'happy_moment',
    });
  });

  it('never asks on web', () => {
    expect(evaluateRating(happyUser(), NOW, { ...ctx, native: false }, 'match_celebrated').ask).toBe(false);
  });

  it('waits for account age and enough sessions', () => {
    const young = happyUser({ firstSeenAt: NOW - 1 * DAY });
    expect(evaluateRating(young, NOW, ctx, 'match_celebrated').reason).toBe('account_too_new');
    const fewSessions = happyUser({ sessions: 2 });
    expect(evaluateRating(fewSessions, NOW, ctx, 'match_celebrated').reason).toBe('too_few_sessions');
  });

  it('prefers the server account age over the first-seen date when provided', () => {
    const s = happyUser({ firstSeenAt: NOW - 1 * DAY });
    expect(evaluateRating(s, NOW, { ...ctx, accountCreatedAt: NOW - 60 * DAY }, 'match_celebrated').ask).toBe(true);
  });

  it('needs a strong trigger AND enough accumulated happiness', () => {
    expect(evaluateRating(happyUser(), NOW, ctx, 'profile_complete').reason).toBe('weak_moment');
    const thin = happyUser({ moments: [{ type: 'match_celebrated', at: NOW - 1000 }] });
    expect(happyScore(thin, NOW)).toBe(MOMENT_WEIGHT.match_celebrated);
    expect(evaluateRating(thin, NOW, ctx, 'match_celebrated').reason).toBe('not_happy_enough');
  });

  it('ignores happy moments older than the window', () => {
    const stale = happyUser({
      moments: [
        { type: 'conversation_milestone', at: NOW - 40 * DAY },
        { type: 'match_celebrated', at: NOW - 1000 },
      ],
    });
    expect(happyScore(stale, NOW)).toBe(MOMENT_WEIGHT.match_celebrated);
  });

  it('stays quiet after a negative event, then recovers', () => {
    const err = happyUser({ negatives: [{ type: 'error_toast', at: NOW - 30 * 60 * 1000 }] });
    expect(evaluateRating(err, NOW, ctx, 'match_celebrated').reason).toBe('negative_error_toast');
    expect(evaluateRating(err, NOW + 3 * HOUR, ctx, 'match_celebrated').ask).toBe(true);

    const pay = happyUser({ negatives: [{ type: 'payment_failed', at: NOW - 3 * DAY }] });
    expect(evaluateRating(pay, NOW, ctx, 'match_celebrated').reason).toBe('negative_payment_failed');
    expect(evaluateRating(pay, NOW + 5 * DAY, ctx, 'match_celebrated').ask).toBe(true);

    const swipes = happyUser({ negatives: [{ type: 'out_of_swipes', at: NOW - 6 * HOUR }] });
    expect(evaluateRating(swipes, NOW, ctx, 'match_celebrated').reason).toBe('negative_out_of_swipes');
  });

  it('spaces native requests and caps them per year', () => {
    const recent = happyUser({ requests: [NOW - 10 * DAY] });
    expect(evaluateRating(recent, NOW, ctx, 'match_celebrated').reason).toBe('too_soon');
    const spaced = happyUser({ requests: [NOW - (RULES.minGapMs + DAY)] });
    expect(evaluateRating(spaced, NOW, ctx, 'match_celebrated').ask).toBe(true);

    const capped = happyUser({ requests: [NOW - 300 * DAY, NOW - 200 * DAY, NOW - 100 * DAY] });
    expect(evaluateRating(capped, NOW, ctx, 'match_celebrated').reason).toBe('yearly_cap');
    // once the oldest request falls out of the 365 day window we may ask again
    const later = NOW + 80 * DAY;
    const refreshed = {
      ...capped,
      moments: [
        { type: 'conversation_milestone' as const, at: later - 2 * DAY },
        { type: 'match_celebrated' as const, at: later - 1000 },
      ],
    };
    expect(evaluateRating(refreshed, later, ctx, 'match_celebrated').ask).toBe(true);
  });

  it('never asks again after the user rated or opened the store page', () => {
    expect(evaluateRating(happyUser({ hasRated: true }), NOW, ctx, 'match_celebrated').reason).toBe('already_rated');
    expect(evaluateRating(happyUser({ storeOpenedAt: NOW - DAY }), NOW, ctx, 'match_celebrated').reason).toBe(
      'already_rated'
    );
  });

  it('does not ask while the user is busy', () => {
    expect(evaluateRating(happyUser(), NOW, { ...ctx, busy: true }, 'match_celebrated').reason).toBe('busy');
  });
});

describe('pruneState', () => {
  it('drops entries that can no longer matter', () => {
    const s = pruneState(
      happyUser({
        moments: [{ type: 'match_celebrated', at: NOW - 90 * DAY }],
        negatives: [{ type: 'error_toast', at: NOW - 20 * DAY }],
        requests: [NOW - 500 * DAY, NOW - 5 * DAY],
      }),
      NOW
    );
    expect(s.moments).toHaveLength(0);
    expect(s.negatives).toHaveLength(0);
    expect(s.requests).toEqual([NOW - 5 * DAY]);
  });
});

const memoryKV = (initial: Record<string, string> = {}): KV & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
};

describe('ratingStore', () => {
  it('round-trips state and survives corrupt data', () => {
    const kv = memoryKV();
    const s = happyUser();
    saveRatingState(s, kv);
    expect(loadRatingState(NOW, kv).sessions).toBe(12);
    kv.setItem(STORAGE_KEY, '{not json');
    expect(loadRatingState(NOW, kv).sessions).toBe(0);
  });

  it('migrates the old funnel: a previous "Yes" stays suppressed', () => {
    const kv = memoryKV({
      driplove_rating_funnel_v2: JSON.stringify({ respondedYes: true, lastShownAt: NOW - 5 * DAY, notNowCount: 0 }),
    });
    const s = loadRatingState(NOW, kv);
    expect(s.hasRated).toBe(true);
    expect(kv.getItem('driplove_rating_funnel_v2')).toBeNull();
    expect(evaluateRating({ ...s, sessions: 12, firstSeenAt: NOW - 60 * DAY, moments: happyUser().moments }, NOW, ctx, 'match_celebrated').ask).toBe(false);
  });

  it('works without any storage at all', () => {
    expect(loadRatingState(NOW, null).sessions).toBe(0);
    expect(() => saveRatingState(happyUser(), null)).not.toThrow();
  });
});

describe('buildReviewUrls', () => {
  it('iOS uses the write-review deep link built from the configured App Store id', () => {
    const urls = buildReviewUrls('ios', { app_store_url: 'https://apps.apple.com/us/app/driplove/id1234567890', play_store_url: null });
    expect(urls[0]).toBe('itms-apps://apps.apple.com/app/id1234567890?action=write-review');
    expect(urls[1]).toBe('https://apps.apple.com/us/app/driplove/id1234567890?action=write-review');
  });

  it('iOS has nothing to open when no store url is configured', () => {
    expect(buildReviewUrls('ios', null)).toEqual([]);
  });

  it('Android prefers market:// and falls back to the web listing, with a safe default package', () => {
    expect(buildReviewUrls('android', null)).toEqual([
      'market://details?id=com.driplove.dating',
      'https://play.google.com/store/apps/details?id=com.driplove.dating',
    ]);
    const cfg = { app_store_url: null, play_store_url: 'https://play.google.com/store/apps/details?id=com.x.y&hl=en' };
    expect(buildReviewUrls('android', cfg)[0]).toBe('market://details?id=com.x.y');
  });
});
