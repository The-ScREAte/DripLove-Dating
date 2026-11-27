import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: null };
const state = {
  profileCalls: [] as { archived: boolean; range: [number, number] }[],
  active: [] as { id: string; is_verified: boolean }[],
  archived: [] as { id: string; is_verified: boolean }[],
  images: [] as unknown[],
  throwOnImages: false,
};

vi.mock('@/utils/circleCountQuery', () => ({ applyCircleCountFilters: (q: unknown) => q }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      let archived = false;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, v: unknown) => { if (col === 'is_archived' && v === true) archived = true; return q; };
      q.neq = () => q;
      q.in = () => q;
      q.range = (a: number, b: number): Promise<Result> => {
        state.profileCalls.push({ archived, range: [a, b] });
        return Promise.resolve({ data: archived ? state.archived : state.active, error: null });
      };
      if (table === 'user_images') {
        q.neq = () => (state.throwOnImages ? Promise.reject(new Error('net')) : Promise.resolve({ data: state.images, error: null }));
      }
      return q;
    },
  },
}));

import { fetchCircleTeaserPhotos, clearCircleTeaserCache } from '../circleTeaserPhotos';

const img = (uid: string, over: Record<string, unknown> = {}) => ({
  user_id: uid, image_url: `https://img.test/${uid}.jpg`, image_order: 0, is_approved: true,
  moderation_status: 'approved', flagged_content: [], ...over,
});

beforeEach(() => {
  clearCircleTeaserCache();
  state.profileCalls = []; state.active = []; state.archived = []; state.images = []; state.throwOnImages = false;
});

describe('fetchCircleTeaserPhotos', () => {
  it('uses active members first, then tops up from archived members when few are active', async () => {
    state.active = [{ id: 'a', is_verified: true }];
    state.archived = [{ id: 'b', is_verified: false }, { id: 'c', is_verified: false }];
    state.images = [img('a'), img('b'), img('c')];
    const out = await fetchCircleTeaserPhotos('viewer', [{ key: 'travel' }], { travel: 3 }, new Set(['viewer']));
    expect(out.travel).toHaveLength(3);
    expect(out.travel[0]).toBe('https://img.test/a.jpg'); // verified first
    expect(state.profileCalls.some((c) => c.archived)).toBe(true);
  });
  it('never shows unmoderated or flagged photos', async () => {
    state.active = [{ id: 'a', is_verified: false }, { id: 'b', is_verified: false }];
    state.images = [img('a', { moderation_status: 'pending' }), img('b', { flagged_content: ['x'] })];
    const out = await fetchCircleTeaserPhotos('viewer', [{ key: 'k' }], { k: 2 }, new Set());
    expect(out.k).toEqual([]);
  });
  it('retries archived from offset 0 when the per-day window comes back empty', async () => {
    state.active = [];
    let n = 0;
    state.archived = [];
    const orig = state.profileCalls.push.bind(state.profileCalls);
    state.profileCalls.push = (...a) => { n++; if (n === 3) state.archived = [{ id: 'z', is_verified: false }]; return orig(...a); };
    state.images = [img('z')];
    const out = await fetchCircleTeaserPhotos('viewer', [{ key: 'k' }], { k: 400 }, new Set());
    expect(out.k).toEqual(['https://img.test/z.jpg']);
    expect(state.profileCalls.filter((c) => c.archived && c.range[0] === 0).length).toBeGreaterThan(0);
  });
  it('returns {} when there are no members at all', async () => {
    expect(await fetchCircleTeaserPhotos('viewer', [{ key: 'k' }], { k: 0 }, new Set())).toEqual({});
  });
  it('returns {} (no throw) when the photo query fails', async () => {
    state.active = [{ id: 'a', is_verified: false }];
    state.throwOnImages = true;
    expect(await fetchCircleTeaserPhotos('viewer', [{ key: 'k' }], { k: 1 }, new Set())).toEqual({});
  });
  it('caches per viewer', async () => {
    state.active = [{ id: 'a', is_verified: false }];
    state.images = [img('a')];
    await fetchCircleTeaserPhotos('v2', [{ key: 'k' }], { k: 1 }, new Set());
    const calls = state.profileCalls.length;
    await fetchCircleTeaserPhotos('v2', [{ key: 'k' }], { k: 1 }, new Set());
    expect(state.profileCalls.length).toBe(calls);
  });
});
