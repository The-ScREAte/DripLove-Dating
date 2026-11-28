import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { activateBoost, getBoostAvailable, getBoostStatus, getBoostedProfilesForMe, loadBoost, resetBoostState } from '../boost';

beforeEach(() => {
  resetBoostState();
  rpc.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('boost feature detection', () => {
  it('hides itself when the RPC is missing and stops calling the network', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_my_boost' } });
    expect(await loadBoost(true)).toBeNull();
    expect(getBoostAvailable()).toBe(false);
    expect(await activateBoost()).toEqual({ kind: 'missing' });
    expect(await getBoostedProfilesForMe()).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a missing read-side RPC does not hide my own button', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function get_boosted_profiles_for_me does not exist' } });
    expect(await getBoostedProfilesForMe()).toEqual([]);
    expect(getBoostAvailable()).toBeNull();
  });
});

describe('boost state', () => {
  it('reads get_my_boost', async () => {
    const ends = new Date(Date.now() + 10 * 60_000).toISOString();
    rpc.mockResolvedValue({ data: { active: true, boost_id: 'b1', kind: 'free', ends_at: ends, is_premium: false, duration_minutes: 15, can_activate: false, next_free_at: null }, error: null });
    const s = await loadBoost(true);
    expect(getBoostAvailable()).toBe(true);
    expect(s?.active).toBe(true);
    expect(s?.kind).toBe('free');
    expect(s?.endsAt).toBe(new Date(ends).getTime());
  });

  it('treats an already-past ends_at as not active', async () => {
    rpc.mockResolvedValue({ data: { active: true, kind: 'premium', ends_at: new Date(Date.now() - 1000).toISOString(), is_premium: true, can_activate: true }, error: null });
    expect((await loadBoost(true))?.active).toBe(false);
  });

  it('activate ok -> active with the server end time', async () => {
    const ends = new Date(Date.now() + 20 * 60_000).toISOString();
    rpc.mockResolvedValue({ data: { ok: true, boost_id: 'b2', kind: 'premium', started_at: new Date().toISOString(), ends_at: ends, duration_minutes: 20 }, error: null });
    const r = await activateBoost();
    expect(r.kind).toBe('ok');
    expect(getBoostStatus()?.active).toBe(true);
    expect(getBoostStatus()?.durationMinutes).toBe(20);
    expect(getBoostStatus()?.canActivate).toBe(false);
  });

  it('activate free_used -> the wait time', async () => {
    const next = new Date(Date.now() + 5 * 3600_000).toISOString();
    rpc.mockResolvedValue({ data: { ok: false, error: 'free_used', next_free_at: next }, error: null });
    expect(await activateBoost()).toEqual({ kind: 'free_used', nextFreeAt: new Date(next).getTime() });
  });

  it('ends locally when the clock runs out (premium can boost again)', async () => {
    vi.useFakeTimers();
    rpc.mockResolvedValue({ data: { ok: true, boost_id: 'b3', kind: 'premium', ends_at: new Date(Date.now() + 60_000).toISOString(), duration_minutes: 20 }, error: null });
    await activateBoost();
    rpc.mockResolvedValue({ data: { active: false, is_premium: true, can_activate: true }, error: null });
    vi.advanceTimersByTime(61_000);
    expect(getBoostStatus()?.active).toBe(false);
  });

  it('boosted rows: drops expired and empty ids', async () => {
    rpc.mockResolvedValue({
      data: [
        { profile_id: 'p1', ends_at: new Date(Date.now() + 60_000).toISOString() },
        { profile_id: 'p2', ends_at: new Date(Date.now() - 60_000).toISOString() },
        { profile_id: '', ends_at: null },
      ],
      error: null,
    });
    expect((await getBoostedProfilesForMe()).map((r) => r.profileId)).toEqual(['p1']);
  });
});
