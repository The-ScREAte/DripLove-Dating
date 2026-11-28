import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  __resetIcebreakerForTests,
  getIcebreakerAvailable,
  getIcebreakerForMatch,
  isMissingBackendError,
  loadQuota,
  loadStatus,
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
    expect(await getIcebreakerForMatch('m1', 'me')).toBeNull();
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
    expect(await loadQuota()).toEqual({ isPremium: false, limit: 3, used: 0, remaining: 3, resetsAt: null });
    expect(getIcebreakerAvailable()).toBe(true);
    rpc.mockResolvedValueOnce({ data: { ok: true, id: 'x', match_id: 'm1', remaining: 2, is_premium: false }, error: null });
    expect(await sendIcebreaker('u1', 'hello')).toEqual({ kind: 'ok', silent: false, matchId: 'm1' });
    expect(getQuota()?.remaining).toBe(2);
  });

  it('a silent (blocked/declined) success spends no quota', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, is_premium: false, limit: 3, used: 1, remaining: 2 }, error: null });
    await loadQuota();
    rpc.mockResolvedValueOnce({ data: { ok: true, silent: true, remaining: 2 }, error: null });
    expect(await sendIcebreaker('u2', 'hello')).toEqual({ kind: 'ok', silent: true, matchId: null });
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

describe('a hello is a normal chat', () => {
  it('a sent hello opens the chat: the profile then offers "Open chat" and the person leaves the queue', async () => {
    const { getCachedStatus, getPendingTargetIds } = await import('../icebreaker');
    rpc.mockResolvedValueOnce({ data: { ok: true, id: 'h1', match_id: 'm5', expires_at: '2026-11-28T10:00:00Z', remaining: 9, limit: 10 }, error: null });
    expect(await sendIcebreaker('p5', 'hi')).toEqual({ kind: 'ok', silent: false, matchId: 'm5' });
    expect(getCachedStatus('p5')).toMatchObject({ matched: true, matchId: 'm5' });
    expect(getPendingTargetIds()).toContain('p5');
  });

  it('reads the running 24h clock of a conversation, from either side', async () => {
    const exp = new Date(Date.now() + 3600_000).toISOString();
    rpc.mockResolvedValueOnce({ data: { pending: true, expires_at: exp, sender_id: 'me', recipient_id: 'you' }, error: null });
    expect(await getIcebreakerForMatch('m1', 'me')).toEqual({ pending: true, expiresAt: exp, mine: true });
    expect(rpc).toHaveBeenLastCalledWith('get_icebreaker_for_match', { p_match: 'm1' });
    rpc.mockResolvedValueOnce({ data: { pending: true, expires_at: exp, sender_id: 'you', recipient_id: 'me' }, error: null });
    expect(await getIcebreakerForMatch('m1', 'me')).toEqual({ pending: true, expiresAt: exp, mine: false });
    rpc.mockResolvedValueOnce({ data: { pending: false }, error: null });
    expect(await getIcebreakerForMatch('m1', 'me')).toEqual({ pending: false, expiresAt: null, mine: false });
  });

  it('a clock that already ran out counts as not pending', async () => {
    rpc.mockResolvedValueOnce({ data: { pending: true, expires_at: new Date(Date.now() - 1000).toISOString(), sender_id: 'me' }, error: null });
    expect((await getIcebreakerForMatch('m1', 'me'))?.pending).toBe(false);
  });

  it('an older backend without get_icebreaker_for_match shows nothing but keeps the rest of the feature on', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, is_premium: false, limit: 10, used: 0, remaining: 10 }, error: null });
    await loadQuota();
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_icebreaker_for_match' } });
    expect(await getIcebreakerForMatch('m1', 'me')).toBeNull();
    expect(getIcebreakerAvailable()).toBe(true);
  });
});

describe('queue exclusion', () => {
  it('loads the people kept out of my queue', async () => {
    const { loadPendingTargets, getPendingTargetIds } = await import('../icebreaker');
    rpc.mockResolvedValueOnce({ data: ['p1', 'p2'], error: null });
    expect(await loadPendingTargets()).toEqual(['p1', 'p2']);
    expect(getPendingTargetIds()).toEqual(['p1', 'p2']);
  });
});

describe('status snapshots, silent sends, failed reads', () => {
  it('an expired "waiting" status settles to a STABLE object (safe for useSyncExternalStore)', async () => {
    const { getCachedStatus } = await import('../icebreaker');
    const past = new Date(Date.now() - 1000).toISOString();
    rpc.mockResolvedValueOnce({ data: { ok: true, matched: false, match_id: null, pending: true, expires_at: past }, error: null });
    await loadStatus('p9');
    const a = getCachedStatus('p9');
    const b = getCachedStatus('p9');
    expect(a).toMatchObject({ pending: false });
    expect(a).toBe(b);
  });

  it('a silent send looks like a normal send to the sender (waiting + out of the queue) but spends nothing', async () => {
    const { getCachedStatus, getPendingTargetIds } = await import('../icebreaker');
    rpc.mockResolvedValueOnce({ data: { ok: true, silent: true, remaining: 7, limit: 10 }, error: null });
    expect(await sendIcebreaker('p7', 'hi')).toEqual({ kind: 'ok', silent: true, matchId: null });
    expect(getCachedStatus('p7')?.pending).toBe(true);
    expect(getCachedStatus('p7')?.expiresAt).toBeTruthy();
    expect(getPendingTargetIds()).toContain('p7');
    expect(getQuota()).toBeNull();
  });

  it('uses the exact RPC names and argument names of the migration', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await sendIcebreaker('r1', 'hello');
    await loadStatus('o1', true);
    expect(rpc).toHaveBeenCalledWith('send_icebreaker', { p_recipient: 'r1', p_message: 'hello' });
    expect(rpc).toHaveBeenCalledWith('get_icebreaker_status', { p_other: 'o1' });
  });
});
