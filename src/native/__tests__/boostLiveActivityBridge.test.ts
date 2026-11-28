import { afterEach, describe, expect, it, vi } from 'vitest';

// The bridge's default deps pull in the real services; keep them off the network / native layer.
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/services/pushNotifications', () => ({ openFromNotificationTap: vi.fn() }));
vi.mock('@/i18n/config', () => ({ default: { t: (_k: string, o: { defaultValue: string }) => o.defaultValue } }));

import type { BoostStartedInfo } from '@/services/boost';
import { initBoostLiveActivityBridge, type BoostLiveActivityBridgeDeps } from '../boostLiveActivityBridge';

const NOW = 1_800_000_000_000;

function setup(opts: { native?: boolean; running?: BoostStartedInfo } = {}) {
  let startedCb: ((b: BoostStartedInfo) => void) | null = null;
  let endedCb: (() => void) | null = null;
  let tapCb: (() => void) | null = null;
  const plugin = {
    start: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    addListener: vi.fn(async (_e: 'tap', cb: () => void) => {
      tapCb = cb;
      return { remove: vi.fn(async () => undefined) };
    }),
  };
  const openBoost = vi.fn();
  const deps: Partial<BoostLiveActivityBridgeDeps> = {
    isNative: () => opts.native ?? true,
    plugin: plugin as unknown as BoostLiveActivityBridgeDeps['plugin'],
    onBoostStarted: (cb) => {
      startedCb = cb;
      if (opts.running) cb(opts.running); // the real service reports a running boost right away
      return () => {
        startedCb = null;
      };
    },
    onBoostEnded: (cb) => {
      endedCb = cb;
      return () => {
        endedCb = null;
      };
    },
    t: (_k, fallback) => fallback,
    openBoost,
    now: () => NOW,
  };
  const stop = initBoostLiveActivityBridge(deps);
  return {
    plugin,
    openBoost,
    stop,
    fireStarted: (b: BoostStartedInfo) => startedCb?.(b),
    fireEnded: () => endedCb?.(),
    fireTap: () => tapCb?.(),
    hasListeners: () => !!startedCb || !!endedCb,
  };
}

let current: ReturnType<typeof setup> | null = null;
afterEach(() => {
  current?.stop();
  current = null;
});

describe('boostLiveActivityBridge', () => {
  it('starts the native countdown with the boost id and end time', () => {
    current = setup();
    const endsAt = NOW + 15 * 60_000;
    current.fireStarted({ boostId: 'b1', endsAt, kind: 'free' });
    expect(current.plugin.start).toHaveBeenCalledTimes(1);
    expect(current.plugin.start).toHaveBeenCalledWith({
      boostId: 'b1',
      endsAt,
      startedAt: NOW,
      title: 'Boost is on',
      subtitle: "You're boosted",
    });
  });

  it('derives the start time from the boost length for a boost found already running', () => {
    current = setup();
    const endsAt = NOW + 5 * 60_000; // premium (20 min) with 5 min left -> started 15 min ago
    current.fireStarted({ boostId: 'p1', endsAt, kind: 'premium' });
    expect(current.plugin.start).toHaveBeenCalledWith(expect.objectContaining({ boostId: 'p1', endsAt, startedAt: NOW - 15 * 60_000 }));
  });

  it('ends the native countdown when the boost ends', () => {
    current = setup();
    current.fireStarted({ boostId: 'b1', endsAt: NOW + 60_000, kind: 'free' });
    current.plugin.end.mockClear();
    current.fireEnded();
    expect(current.plugin.end).toHaveBeenCalledTimes(1);
    expect(current.plugin.end).toHaveBeenCalledWith();
  });

  it('clears only an expired leftover at start-up when nothing is running', () => {
    current = setup();
    expect(current.plugin.end).toHaveBeenCalledWith({ onlyExpired: true });
  });

  it('keeps a running boost at start-up (no clean-up call, just start)', () => {
    current = setup({ running: { boostId: 'b9', endsAt: NOW + 60_000, kind: 'free' } });
    expect(current.plugin.start).toHaveBeenCalledWith(expect.objectContaining({ boostId: 'b9' }));
    expect(current.plugin.end).not.toHaveBeenCalled();
  });

  it('ignores a boost whose end time already passed', () => {
    current = setup();
    current.fireStarted({ boostId: 'old', endsAt: NOW - 1, kind: 'free' });
    expect(current.plugin.start).not.toHaveBeenCalled();
  });

  it('a Live Activity tap opens the boost destination', async () => {
    current = setup();
    await Promise.resolve();
    current.fireTap();
    expect(current.openBoost).toHaveBeenCalledTimes(1);
  });

  it('survives a binary without the plugin (calls reject)', async () => {
    current = setup();
    current.plugin.start.mockImplementation(async () => {
      throw new Error('not implemented');
    });
    expect(() => current!.fireStarted({ boostId: 'b1', endsAt: NOW + 60_000, kind: 'free' })).not.toThrow();
    await Promise.resolve();
  });

  it('does nothing on web', () => {
    current = setup({ native: false });
    current.fireStarted({ boostId: 'b1', endsAt: NOW + 60_000, kind: 'free' });
    current.fireEnded();
    expect(current.hasListeners()).toBe(false);
    expect(current.plugin.start).not.toHaveBeenCalled();
    expect(current.plugin.end).not.toHaveBeenCalled();
    expect(current.plugin.addListener).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    current = setup();
    const again = initBoostLiveActivityBridge();
    expect(again).toBe(current.stop);
  });
});
