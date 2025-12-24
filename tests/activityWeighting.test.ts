import { describe, expect, it } from 'vitest';

import {
  applyActivityWeighting,
  getSwipeFatigueRescueCandidates,
  injectRescueProfiles,
} from '../src/utils/activityWeighting';

describe('activityWeighting', () => {
  it('applyActivityWeighting keeps all profiles and is deterministic for a seed', () => {
    const now = Date.now();
    const recent = new Date(now - 1 * 60 * 60 * 1000).toISOString();
    const old = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

    const input = [
      { id: 'a', last_login_at: old },
      { id: 'b', last_login_at: recent },
      { id: 'c', created_at: recent },
      { id: 'd', last_login_at: old },
    ];

    const out1 = applyActivityWeighting(input, 'seed-1');
    const out2 = applyActivityWeighting(input, 'seed-1');

    expect(out1.map((p) => p.id)).toEqual(out2.map((p) => p.id));
    expect(new Set(out1.map((p) => p.id))).toEqual(new Set(input.map((p) => p.id)));
  });

  it('getSwipeFatigueRescueCandidates prefers liked-me among active candidates (still deterministic)', () => {
    const now = Date.now();
    const recent = new Date(now - 2 * 60 * 60 * 1000).toISOString();

    const profiles = [
      { id: 'liked1', last_login_at: recent },
      { id: 'other1', last_login_at: recent },
      { id: 'liked2', last_login_at: recent },
      { id: 'other2', last_login_at: recent },
    ];

    const liked = new Set(['liked1', 'liked2']);

    const picks1 = getSwipeFatigueRescueCandidates(profiles, 2, 'seed-x', liked);
    const picks2 = getSwipeFatigueRescueCandidates(profiles, 2, 'seed-x', liked);

    expect(picks1.map((p) => p.id)).toEqual(picks2.map((p) => p.id));
    // both picks should come from the liked set when enough exist
    expect(picks1.every((p) => liked.has(p.id))).toBe(true);
  });

  it('injectRescueProfiles is deterministic when seed is provided', () => {
    const feed = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}` }));
    const rescue = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];

    const out1 = injectRescueProfiles(feed, rescue, {
      maxPercent: 0.15,
      spacing: [2, 4],
      startPosition: 1,
      seed: 'spacing-seed',
    });

    const out2 = injectRescueProfiles(feed, rescue, {
      maxPercent: 0.15,
      spacing: [2, 4],
      startPosition: 1,
      seed: 'spacing-seed',
    });

    expect(out1.map((p) => p.id)).toEqual(out2.map((p) => p.id));
  });
});
