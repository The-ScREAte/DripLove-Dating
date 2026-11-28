import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { activateBoost, loadBoost, onBoostEnded, onBoostStarted, resetBoostState } from '../boost';

const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-28T10:00:00Z'));
  rpc.mockReset();
  resetBoostState();
});
afterEach(() => {
  resetBoostState();
  vi.useRealTimers();
});

describe('onBoostStarted / onBoostEnded (for the native timer)', () => {
  it('fires started on activate and ended when the time runs out', async () => {
    const started = vi.fn();
    const ended = vi.fn();
    const offS = onBoostStarted(started);
    const offE = onBoostEnded(ended);
    const endsAt = Date.now() + 15 * 60_000;
    rpc.mockResolvedValueOnce({ data: { ok: true, boost_id: 'b1', kind: 'free', ends_at: iso(endsAt), duration_minutes: 15 }, error: null });
    await activateBoost();
    expect(started).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledWith({ boostId: 'b1', endsAt, kind: 'free' });
    expect(ended).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: { active: false, can_activate: false }, error: null });
    vi.advanceTimersByTime(15 * 60_000 + 10);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended.mock.calls[0][0].boostId).toBe('b1');
    expect(ended.mock.calls[0][1]).toBe('expired');
    expect(started).toHaveBeenCalledTimes(1);
    offS();
    offE();
  });

  it('reports a boost already running on app start, also to a late subscriber, and signed_out on reset', async () => {
    const endsAt = Date.now() + 20 * 60_000;
    rpc.mockResolvedValue({ data: { active: true, boost_id: 'b2', kind: 'premium', ends_at: iso(endsAt), is_premium: true, duration_minutes: 20 }, error: null });
    const early = vi.fn();
    const offEarly = onBoostStarted(early);
    await loadBoost(true);
    expect(early).toHaveBeenCalledWith({ boostId: 'b2', endsAt, kind: 'premium' });

    // the same boost loaded again (resume) is not a new start
    await loadBoost(true);
    expect(early).toHaveBeenCalledTimes(1);

    const late = vi.fn();
    const offLate = onBoostStarted(late);
    expect(late).toHaveBeenCalledWith({ boostId: 'b2', endsAt, kind: 'premium' });

    const ended = vi.fn();
    const offE = onBoostEnded(ended);
    resetBoostState();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended.mock.calls[0][1]).toBe('signed_out');
    offEarly();
    offLate();
    offE();
  });

  it('reports stopped when the server says the boost is no longer on before its end', async () => {
    const endsAt = Date.now() + 20 * 60_000;
    rpc.mockResolvedValueOnce({ data: { active: true, boost_id: 'b3', kind: 'premium', ends_at: iso(endsAt), is_premium: true }, error: null });
    await loadBoost(true);
    const ended = vi.fn();
    const offE = onBoostEnded(ended);
    rpc.mockResolvedValueOnce({ data: { active: false, is_premium: true, can_activate: true }, error: null });
    await loadBoost(true);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended.mock.calls[0][1]).toBe('stopped');
    offE();
  });
});
