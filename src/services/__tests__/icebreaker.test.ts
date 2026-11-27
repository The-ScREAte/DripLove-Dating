import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  __resetIcebreakerForTests,
  getIcebreakerAvailable,
  getInbox,
  isMissingBackendError,
  loadQuota,
  loadStatus,
  refreshInbox,
  respondIcebreaker,
  sendIcebreaker,
  getQuota,
} from '../icebreaker';

beforeEach(() => {
  __resetIcebreakerForTests();
  rpc.mockReset();
});

describe('feature detection (migration not applied yet)', () => {
  it('recognises "function not found" style errors', () => {
    expect(isMissingBackendError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingBackendError({ code: '42883' })).toBe(true);
    expect(isMissingBackendError({ message: 'Could not find the function public.get_icebreaker_quota' })).toBe(true);
    expect(isMissingBackendError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingBackendError(null)).toBe(false);
  });

  it('hides the feature after the first missing-function error and stops calling the network', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await loadQuota()).toBeNull();
    expect(getIcebreakerAvailable()).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    // everything else short-circuits: no more requests, no throw
    expect(await loadStatus('u1')).toBeNull();
    expect(await sendIcebreaker('u1', 'hi')).toEqual({ kind: 'missing' });
    expect(await refreshInbox()).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a network failure does NOT hide the feature', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    expect(await loadQuota()).toBeNull();
    expect(getIcebreakerAvailable()).toBeNull();
  });
});

describe('quota + send flow', () => {
  it('loads quota, then decrements locally on a successful send', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, is_premium: false, limit: 3, used: 0, remaining: 3 }, error: null });
    expect(await loadQuota()).toEqual({ isPremium: false, limit: 3, used: 0, remaining: 3 });
    expect(getIcebreakerAvailable()).toBe(true);
    rpc.mockResolvedValueOnce({ data: { ok: true, id: 'x', remaining: 2, is_premium: false }, error: null });
    expect(await sendIcebreaker('u1', 'hello')).toEqual({ kind: 'ok', silent: false });
    expect(getQuota()?.remaining).toBe(2);
  });

  it('a silent (blocked/declined) success spends no quota', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, is_premium: false, limit: 3, used: 1, remaining: 2 }, error: null });
    await loadQuota();
    rpc.mockResolvedValueOnce({ data: { ok: true, silent: true, remaining: 2 }, error: null });
    expect(await sendIcebreaker('u2', 'hello')).toEqual({ kind: 'ok', silent: true });
    expect(getQuota()?.remaining).toBe(2);
  });

  it('maps quota_exhausted / already_matched', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, is_premium: false, limit: 3, used: 3, remaining: 0 }, error: null });
    await loadQuota();
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'quota_exhausted' }, error: null });
    expect(await sendIcebreaker('u3', 'hello')).toEqual({ kind: 'error', code: 'quota_exhausted' });
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'already_matched', match_id: 'm1' }, error: null });
    expect(await sendIcebreaker('u4', 'hello')).toEqual({ kind: 'already_matched', matchId: 'm1' });
  });
});

describe('inbox + respond', () => {
  const row = { id: 'i1', sender_id: 's1', message: 'hey', created_at: '2026-11-27T10:00:00Z', first_name: 'Kofi', age: 30, city: 'Accra', is_verified: true, photo_url: null };
  it('maps rows and removes an item once answered', async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    const items = await refreshInbox();
    expect(items[0]).toMatchObject({ id: 'i1', firstName: 'Kofi', isVerified: true, photoUrl: null });
    rpc.mockResolvedValueOnce({ data: { ok: true, status: 'accepted', match_id: 'm9' }, error: null });
    expect(await respondIcebreaker('i1', true)).toEqual({ ok: true, matchId: 'm9' });
    expect(getInbox().items).toHaveLength(0);
  });
  it('drops an item that was already handled elsewhere', async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    await refreshInbox();
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'not_pending' }, error: null });
    expect((await respondIcebreaker('i1', true)).ok).toBe(false);
    expect(getInbox().items).toHaveLength(0);
  });
});
