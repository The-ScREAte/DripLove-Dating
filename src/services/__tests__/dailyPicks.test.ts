import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const tables: Record<string, unknown[]> = {};
const chain = (rows: unknown[]) => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'neq', 'order']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return q;
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (t: string) => chain(tables[t] || []),
  },
}));

import { __resetDailyPicksForTests, fetchDailyPicks, outOfRangeLabel, visiblePicks } from '../dailyPicks';

const row = (id: string, slot: number, extra: Record<string, unknown> = {}) => ({
  profile_id: id,
  slot,
  is_out_of_range: false,
  out_of_range_reason: null,
  age: 27,
  distance_km: 4,
  shared_trait: null,
  is_decided: false,
  is_away: false,
  pick_date: '2026-11-28',
  ...extra,
});

beforeEach(() => {
  __resetDailyPicksForTests();
  rpc.mockReset();
  tables.profiles = [];
  tables.user_images = [];
});

describe('fetchDailyPicks', () => {
  it('hides itself when the migration is not applied, and stops calling', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await fetchDailyPicks()).toEqual({ available: false });
    expect(await fetchDailyPicks()).toEqual({ available: false });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('returns 4 in-range + 1 out-of-range in order, with names and first photos, dropping decided ones', async () => {
    rpc.mockResolvedValue({
      data: [
        row('a', 1), row('b', 2), row('c', 3, { is_decided: true }), row('d', 4),
        row('e', 5, { is_out_of_range: true, out_of_range_reason: 'distance' }),
      ],
      error: null,
    });
    tables.profiles = ['a', 'b', 'd', 'e'].map((id) => ({ id, first_name: id.toUpperCase(), city: 'Accra' }));
    tables.user_images = [
      { user_id: 'a', image_url: 'a1', image_order: 0 },
      { user_id: 'a', image_url: 'a2', image_order: 1 },
      { user_id: 'e', image_url: 'e1', image_order: 0 },
    ];
    const res = await fetchDailyPicks();
    expect(res.available).toBe(true);
    if (!res.available) return;
    expect(res.pickDate).toBe('2026-11-28');
    expect(res.picks.map((p) => p.profile_id)).toEqual(['a', 'b', 'd', 'e']);
    expect(res.picks[0]).toMatchObject({ first_name: 'A', photo: 'a1' });
    expect(res.picks[1].photo).toBeNull();
    expect(res.picks[3]).toMatchObject({ is_out_of_range: true, photo: 'e1' });
  });

  it('reports other errors without hiding the feature', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Not authorized' } });
    expect(await fetchDailyPicks()).toEqual({ available: true, pickDate: null, picks: [], error: 'Not authorized' });
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchDailyPicks()).toEqual({ available: true, pickDate: null, picks: [] });
  });
});

describe('helpers', () => {
  it('labels only the out-of-range pick', () => {
    expect(outOfRangeLabel({ is_out_of_range: false, out_of_range_reason: null })).toBeNull();
    expect(outOfRangeLabel({ is_out_of_range: true, out_of_range_reason: 'age' })).toBe('Just outside your age range');
    expect(outOfRangeLabel({ is_out_of_range: true, out_of_range_reason: 'distance' })).toBe('A little further than usual');
  });
  it('visiblePicks keeps order and drops decided', () => {
    expect(visiblePicks([{ is_decided: false, k: 1 }, { is_decided: true, k: 2 }, { is_decided: false, k: 3 }]).map((r) => r.k)).toEqual([1, 3]);
  });
});
