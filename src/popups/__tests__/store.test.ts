import { describe, expect, it, beforeEach } from 'vitest';
import { PopupStore, MIN_GAP_MS, QUIET_AFTER_RESUME_MS } from '../store';
import { createLocalPopupStorage } from '../storage';
import type { PopupEvent } from '../types';

const memoryBacking = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

const setup = () => {
  let now = 1_000_000_000_000;
  const timers: { at: number; fn: () => void; h: number }[] = [];
  let hid = 0;
  const events: PopupEvent[] = [];
  const store = new PopupStore({
    now: () => now,
    storage: createLocalPopupStorage(memoryBacking()),
    onEvent: (e) => events.push(e),
    setTimer: (fn, ms) => {
      const h = ++hid;
      timers.push({ at: now + ms, fn, h });
      return h;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.h === h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const next = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers.splice(timers.indexOf(next), 1);
      now = Math.max(now, next.at);
      next.fn();
    }
    now = target;
  };
  store.setUser('u1');
  store.setEnv({ authed: true, onboardingDone: true, screen: 'dripcheck', isPremium: false, dataReady: true, appActive: true });
  return { store, advance, events, now: () => now };
};

describe('PopupStore', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
    t.advance(QUIET_AFTER_RESUME_MS + 1);
  });

  it('shows one popup at a time and queues the rest by tier then arrival', () => {
    t.store.register(
      { id: 'passive', tier: 'passive' },
      { id: 'engage', tier: 'engagement' },
      { id: 'tx', tier: 'transactional', ignoreDataReady: true }
    );
    t.store.setBusy('typing', true); // hold everything
    t.store.request('passive');
    t.store.request('engage');
    t.store.request('tx');
    expect(t.store.getActive()).toBeNull();
    t.store.setBusy('typing', false);
    expect(t.store.getActive()?.id).toBe('tx'); // transactional first, ignores the min gap
    t.store.request('tx'); // duplicate while active: ignored
    t.store.close('tx');
    expect(t.store.getActive()).toBeNull(); // engagement waits out the min gap
    t.advance(MIN_GAP_MS);
    expect(t.store.getActive()?.id).toBe('engage');
    t.store.close('engage');
    t.advance(MIN_GAP_MS);
    expect(t.store.getActive()?.id).toBe('passive');
  });

  it('never shows during onboarding, signed out, or in the background', () => {
    t.store.register({ id: 'a', tier: 'transactional', ignoreDataReady: true });
    t.store.setEnv({ onboardingDone: false });
    t.store.request('a');
    expect(t.store.getActive()).toBeNull();
    t.store.setEnv({ onboardingDone: true, appActive: false });
    expect(t.store.getActive()).toBeNull();
    t.store.setEnv({ appActive: true });
    expect(t.store.getActive()?.id).toBe('a');
  });

  it('waits while the user is busy (typing, touching, call, payment, keyboard)', () => {
    t.store.register(
      { id: 'calm', tier: 'engagement' },
      { id: 'tx', tier: 'transactional', userInitiated: true, ignoreDataReady: true },
      { id: 'sys', tier: 'critical', ignoreDataReady: true }
    );
    t.store.setBusy('touching', true);
    t.store.request('calm');
    t.store.request('sys'); // a system notice (not caused by the user) never lands mid-swipe
    expect(t.store.getActive()).toBeNull();
    t.store.cancel('sys');
    t.store.request('tx'); // what the user just did may show; only call/camera/payment/os-permission block it
    expect(t.store.getActive()?.id).toBe('tx');
    t.store.close('tx');
    t.store.setBusy('payment', true);
    t.store.request('tx');
    expect(t.store.getActive()).toBeNull();
    t.store.setBusy('payment', false);
    expect(t.store.getActive()?.id).toBe('tx');
    t.store.close('tx');
    t.store.setBusy('touching', false);
    t.advance(MIN_GAP_MS);
    expect(t.store.getActive()?.id).toBe('calm');
  });

  it('applies the quiet period after launch/resume to calm popups only', () => {
    t.store.register({ id: 'calm', tier: 'engagement' }, { id: 'tx', tier: 'transactional', ignoreDataReady: true });
    t.store.setEnv({ appActive: false });
    t.store.setEnv({ appActive: true }); // resumed
    t.store.request('calm');
    expect(t.store.getActive()).toBeNull();
    t.store.request('tx');
    expect(t.store.getActive()?.id).toBe('tx');
    t.store.close('tx');
    t.advance(MIN_GAP_MS);
    expect(t.store.getActive()?.id).toBe('calm');
  });

  it('enforces cooldown, per-day, per-session and lifetime caps (persisted per user)', () => {
    t.store.register(
      { id: 'cool', tier: 'transactional', ignoreDataReady: true, cooldownMs: 60_000, ttlMs: 10_000 },
      { id: 'once', tier: 'transactional', ignoreDataReady: true, maxTotal: 1 },
      { id: 'sess', tier: 'transactional', ignoreDataReady: true, maxPerSession: 1 }
    );
    t.store.request('cool');
    expect(t.store.getActive()?.id).toBe('cool');
    t.store.close('cool');
    t.store.request('cool'); // cooldown longer than the request lives -> dropped, not queued forever
    expect(t.store.getActive()).toBeNull();
    expect(t.store.isQueued('cool')).toBe(false);
    t.advance(61_000);
    t.store.request('cool');
    expect(t.store.getActive()?.id).toBe('cool');
    t.store.close('cool');

    t.store.request('once');
    t.store.close('once');
    t.store.request('once');
    expect(t.store.getActive()).toBeNull();
    expect(t.store.timesShown('once')).toBe(1);

    t.store.request('sess');
    t.store.close('sess');
    t.store.request('sess');
    expect(t.store.getActive()).toBeNull();
  });

  it('drops a queued popup whose condition no longer holds (never stale)', () => {
    let premium = false;
    t.store.register({ id: 'upsell', tier: 'engagement', eligible: () => !premium });
    t.store.setBusy('typing', true);
    t.store.request('upsell');
    premium = true;
    t.store.setBusy('typing', false);
    t.advance(MIN_GAP_MS);
    expect(t.store.getActive()).toBeNull();
    expect(t.store.isQueued('upsell')).toBe(false);
  });

  it('keeps a request alive only until its TTL', () => {
    t.store.register({ id: 'calm', tier: 'passive', ttlMs: 5_000 });
    t.store.setBusy('keyboard', true);
    t.store.request('calm');
    t.advance(6_000);
    t.store.setBusy('keyboard', false);
    expect(t.store.getActive()).toBeNull();
    expect(t.events.some((e) => e.type === 'expired' && e.id === 'calm')).toBe(true);
  });

  it('only shows on its allowed screens and waits for the user to get there', () => {
    t.store.register({ id: 'guide', tier: 'engagement', screens: ['dripcheck'], ignoreDataReady: true });
    t.store.setEnv({ screen: 'chat' });
    t.store.request('guide');
    expect(t.store.getActive()).toBeNull();
    t.store.setEnv({ screen: 'dripcheck' });
    expect(t.store.getActive()?.id).toBe('guide');
  });

  it('a user-initiated popup preempts an engagement popup but not a transactional one', () => {
    t.store.register(
      { id: 'streak', tier: 'engagement', ignoreDataReady: true },
      { id: 'upgrade', tier: 'transactional', userInitiated: true, ignoreDataReady: true },
      { id: 'match', tier: 'transactional', userInitiated: true, ignoreDataReady: true }
    );
    t.store.request('streak');
    expect(t.store.getActive()?.id).toBe('streak');
    t.store.request('upgrade');
    expect(t.store.getActive()?.id).toBe('upgrade');
    expect(t.events.some((e) => e.type === 'preempted' && e.id === 'streak')).toBe(true);
    t.store.request('match'); // does not interrupt another transactional popup
    expect(t.store.getActive()?.id).toBe('upgrade');
    t.store.close('upgrade');
    expect(t.store.getActive()?.id).toBe('match');
  });

  it('honours delayMs, minAppAgeMs and autoCloseMs', () => {
    t.store.register(
      { id: 'later', tier: 'transactional', ignoreDataReady: true },
      { id: 'young', tier: 'engagement', ignoreDataReady: true, minAppAgeMs: 10 * 60_000, ttlMs: 30 * 60_000 },
      { id: 'auto', tier: 'transactional', ignoreDataReady: true, autoCloseMs: 25_000 }
    );
    t.store.request('later', undefined, { delayMs: 3000 });
    expect(t.store.getActive()).toBeNull();
    t.advance(3100);
    expect(t.store.getActive()?.id).toBe('later');
    t.store.close('later');

    t.store.request('young');
    expect(t.store.getActive()).toBeNull();
    t.advance(10 * 60_000);
    expect(t.store.getActive()?.id).toBe('young');
    t.store.close('young');

    t.store.request('auto');
    expect(t.store.getActive()?.id).toBe('auto');
    t.advance(25_100);
    expect(t.store.getActive()).toBeNull();
  });

  it('imports legacy "already shown" history so existing users are not re-nagged', () => {
    t.store.register({ id: 'old', tier: 'transactional', ignoreDataReady: true, maxTotal: 1, legacy: () => ({ total: 1 }) });
    t.store.request('old');
    expect(t.store.getActive()).toBeNull();
  });

  it('ignores undefined env fields instead of wiping known state', () => {
    t.store.register({ id: 'a', tier: 'transactional', ignoreDataReady: true });
    t.store.setEnv({ appActive: undefined, screen: undefined });
    expect(t.store.getEnv().appActive).toBe(true);
    t.store.request('a');
    expect(t.store.getActive()?.id).toBe('a');
  });

  it('closing an unknown or queued popup is safe, and cancel removes a queued request', () => {
    t.store.register({ id: 'q', tier: 'engagement' });
    t.store.setBusy('typing', true);
    t.store.request('q');
    t.store.cancel('q');
    expect(t.store.isQueued('q')).toBe(false);
    t.store.close('nope');
    expect(t.store.request('nope')).toBe(false);
  });
});
