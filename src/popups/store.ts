import {
  DEFAULT_ENV,
  TIER_RANK,
  type ActivePopup,
  type BusyReason,
  type PopupDefinition,
  type PopupEnv,
  type PopupEvent,
  type PopupOutcome,
  type PopupRecord,
  type PopupRequestOptions,
  type PopupTier,
} from './types';
import { createLocalPopupStorage, localDayKey, newRecord, type PopupStorage } from './storage';

/** Minimum quiet time between two non-critical, non-user-initiated popups. */
export const MIN_GAP_MS = 75_000;
/** After launch / coming back to the foreground, engagement+passive popups wait this long. */
export const QUIET_AFTER_RESUME_MS = 8_000;
export const DEFAULT_TTL_MS = 10 * 60_000;

/** Nothing, however important, may land over these. */
const ALWAYS_BLOCKED: readonly BusyReason[] = ['camera', 'call', 'payment', 'os-permission'];
/** Calm moments only: the user is typing, touching/dragging, has the keyboard up, is in a chat or on a blocking screen. */
const CALM_BLOCKED: readonly BusyReason[] = [
  ...ALWAYS_BLOCKED,
  'typing',
  'touching',
  'keyboard',
  'chat-detail',
  'blocking-screen',
];
/** Important but not caused by the user just now (e.g. a payment notice): still never over typing or a swipe. */
const SYSTEM_BLOCKED: readonly BusyReason[] = [...ALWAYS_BLOCKED, 'typing', 'touching', 'keyboard'];

const defaultBlockedBy = (def: PopupDefinition): readonly BusyReason[] => {
  // The user just tapped Upgrade / just made a match: that IS the moment, only hard conflicts wait.
  if (def.userInitiated) return ALWAYS_BLOCKED;
  return def.tier === 'critical' || def.tier === 'transactional' ? SYSTEM_BLOCKED : CALM_BLOCKED;
};

interface Entry {
  id: string;
  payload: unknown;
  expiresAt: number;
  notBefore: number;
  seq: number;
}

type Decision = { kind: 'show' } | { kind: 'wait'; wakeAt?: number } | { kind: 'drop' };

export interface PopupStoreOptions {
  now?: () => number;
  storage?: PopupStorage;
  /** Analytics/telemetry hook. */
  onEvent?: (event: PopupEvent) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Decides WHAT popup shows WHEN. Pure TypeScript (no React) so the rules are unit-testable.
 *
 * Guarantees:
 *  - at most one popup visible at any time;
 *  - requests are queued, deduped by id, ordered by tier then arrival;
 *  - nothing shows while the user is busy (typing, touching, call, camera, payment, ...),
 *    while signed out / still onboarding, or while the app is in the background;
 *  - engagement/passive popups respect a min gap, a quiet time after launch/resume,
 *    per-popup cooldowns and daily/session/lifetime caps (persisted per user);
 *  - a queued popup whose condition no longer holds is dropped, never shown stale.
 */
export class PopupStore {
  private defs = new Map<string, PopupDefinition>();
  private env: PopupEnv = { ...DEFAULT_ENV };
  private userId: string | null = null;
  private busy = new Map<BusyReason, number>();
  private queue: Entry[] = [];
  private active: ActivePopup | null = null;
  private activeTier: PopupTier | null = null;
  private timing = { minGapMs: MIN_GAP_MS, quietMs: QUIET_AFTER_RESUME_MS };
  private lastClosedAt = 0;
  private quietUntil = 0;
  private seq = 0;
  private showKey = 0;
  private sessionCounts = new Map<string, number>();
  private listeners = new Set<() => void>();
  private timer: unknown = null;
  private autoCloseHandle: unknown = null;
  private snapshot: { active: ActivePopup | null } = { active: null };
  private readonly now: () => number;
  private readonly storage: PopupStorage;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  onEvent?: (event: PopupEvent) => void;

  constructor(options: PopupStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.storage = options.storage ?? createLocalPopupStorage();
    this.onEvent = options.onEvent;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.quietUntil = this.now() + this.timing.quietMs;
  }

  /** Test/QA hook: shorten the gaps (e.g. 3 s) so scenarios can be driven in seconds. Never used in production code. */
  configureTiming(timing: Partial<{ minGapMs: number; quietMs: number }>): void {
    this.timing = { ...this.timing, ...timing };
  }

  // ---- registry ----------------------------------------------------------
  register(...defs: PopupDefinition[]): void {
    for (const def of defs) this.defs.set(def.id, def);
  }

  // ---- React subscription ---------------------------------------------------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): { active: ActivePopup | null } => this.snapshot;

  private emitChange(): void {
    this.snapshot = { active: this.active };
    this.listeners.forEach((l) => l());
  }

  // ---- inputs ---------------------------------------------------------------
  setUser(userId: string | null): void {
    if (this.userId === userId) return;
    this.userId = userId;
    this.queue = [];
    if (this.active) this.finish('dropped', false);
    if (userId) this.storage.getFirstSeen(userId, this.now());
    this.evaluate();
  }

  setEnv(patch: Partial<PopupEnv>): void {
    const prev = this.env;
    // Ignore undefined values: a caller that doesn't know a field must not wipe what we already know.
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<PopupEnv>;
    this.env = { ...prev, ...defined };
    if (defined.appActive === true && prev.appActive === false) {
      this.quietUntil = this.now() + this.timing.quietMs;
    }
    this.evaluate();
  }

  getEnv(): PopupEnv {
    return this.env;
  }

  /** Ref-counted: call with true/false from every place that is "busy". */
  setBusy(reason: BusyReason, isBusy: boolean): void {
    const n = this.busy.get(reason) ?? 0;
    const next = Math.max(0, n + (isBusy ? 1 : -1));
    if (next === 0) this.busy.delete(reason);
    else this.busy.set(reason, next);
    if (next === 0 || n === 0) this.evaluate();
  }

  isBusy(reason: BusyReason): boolean {
    return (this.busy.get(reason) ?? 0) > 0;
  }

  // ---- API ------------------------------------------------------------------
  /** Ask to show a popup. Returns false when it was ignored (unknown id, already active/queued). */
  request(id: string, payload?: unknown, options: PopupRequestOptions = {}): boolean {
    const def = this.defs.get(id);
    if (!def) {
      if (typeof console !== 'undefined') console.warn(`[popups] unknown popup "${id}"`);
      return false;
    }
    if (this.active?.id === id) return false;
    const now = this.now();
    const ttl = options.ttlMs ?? def.ttlMs ?? DEFAULT_TTL_MS;
    const notBefore = now + (options.delayMs ?? 0);
    const queued = this.queue.find((e) => e.id === id);
    if (queued) {
      queued.payload = payload;
      queued.expiresAt = Math.max(now + ttl, notBefore + 1000);
      queued.notBefore = notBefore;
    } else {
      this.queue.push({
        id,
        payload,
        expiresAt: Math.max(now + ttl, notBefore + 1000),
        notBefore,
        seq: this.seq++,
      });
    }

    // A tap on "Upgrade" must not wait behind a streak banner or a rating nudge.
    if (def.userInitiated && this.active && this.activeTier && TIER_RANK[this.activeTier] >= TIER_RANK.engagement) {
      this.finish('preempted', false);
    }
    this.evaluate();
    return true;
  }

  /** Close the active popup (or remove it from the queue). */
  close(id: string, outcome: Extract<PopupOutcome, 'dismissed' | 'converted'> = 'dismissed'): void {
    if (this.active?.id === id) {
      this.finish(outcome, true);
      this.evaluate();
      return;
    }
    const idx = this.queue.findIndex((e) => e.id === id);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.emit('dropped', id);
    }
  }

  /** Remove a queued request without showing it (e.g. the condition went away). */
  cancel(id: string): void {
    const idx = this.queue.findIndex((e) => e.id === id);
    if (idx >= 0) this.queue.splice(idx, 1);
    if (this.active?.id === id) this.close(id, 'dismissed');
  }

  /** How many times this popup has been shown to the current user (lifetime, incl. imported legacy history). */
  timesShown(id: string): number {
    const def = this.defs.get(id);
    if (!def || !this.userId) return 0;
    return this.record(def).total;
  }

  isActive(id: string): boolean {
    return this.active?.id === id;
  }

  isQueued(id: string): boolean {
    return this.queue.some((e) => e.id === id);
  }

  getActive(): ActivePopup | null {
    return this.active;
  }

  // ---- engine ---------------------------------------------------------------
  private emit(type: PopupEvent['type'], id: string): void {
    const def = this.defs.get(id);
    if (!def || !this.onEvent) return;
    try {
      this.onEvent({ type, id, tier: def.tier, at: this.now() });
    } catch {
      // telemetry must never break the app
    }
  }

  private recordShown(def: PopupDefinition): void {
    const userId = this.userId;
    const now = this.now();
    this.sessionCounts.set(def.id, (this.sessionCounts.get(def.id) ?? 0) + 1);
    if (!userId) return;
    const rec = this.storage.getRecord(userId, def.id) ?? newRecord();
    const dayKey = localDayKey(now);
    this.storage.setRecord(userId, def.id, {
      ...rec,
      lastShownAt: now,
      dayKey,
      dayCount: rec.dayKey === dayKey ? rec.dayCount + 1 : 1,
      total: rec.total + 1,
    });
  }

  private record(def: PopupDefinition): PopupRecord {
    const userId = this.userId;
    if (!userId) return newRecord();
    let rec = this.storage.getRecord(userId, def.id);
    if (!rec && def.legacy) {
      const legacy = def.legacy(userId);
      rec = { ...newRecord(), ...(legacy ?? {}) };
      this.storage.setRecord(userId, def.id, rec);
    }
    return rec ?? newRecord();
  }

  private finish(outcome: PopupOutcome, evaluateAfter: boolean): void {
    if (!this.active) return;
    const { id } = this.active;
    const userId = this.userId;
    if (this.autoCloseHandle !== null) {
      this.clearTimer(this.autoCloseHandle);
      this.autoCloseHandle = null;
    }
    this.active = null;
    this.activeTier = null;
    this.lastClosedAt = this.now();
    if (userId) {
      const def = this.defs.get(id);
      if (def) {
        const rec = this.storage.getRecord(userId, id);
        if (rec) this.storage.setRecord(userId, id, { ...rec, lastOutcome: outcome });
      }
    }
    this.emit(outcome, id);
    this.emitChange();
    if (evaluateAfter) this.evaluate();
  }

  private decide(def: PopupDefinition, entry: Entry, now: number): Decision {
    if (entry.expiresAt <= now) return { kind: 'drop' };
    const env = this.env;

    // Hard gates: nothing shows signed out / during onboarding.
    if (!this.userId || !env.authed || !env.onboardingDone) return { kind: 'wait' };
    if (!env.appActive) return { kind: 'wait' };
    if (!def.ignoreDataReady && (!env.dataReady || env.isPremium === null)) return { kind: 'wait' };

    // Condition no longer holds -> never show stale.
    if (def.eligible && !def.eligible(env, entry.payload as never)) {
      return def.keepWhenIneligible ? { kind: 'wait' } : { kind: 'drop' };
    }
    if (def.screens && !def.screens.includes(env.screen)) return { kind: 'wait' };

    const rec = this.record(def);
    if (def.maxTotal !== undefined && rec.total >= def.maxTotal) return { kind: 'drop' };
    if (def.maxPerSession !== undefined && (this.sessionCounts.get(def.id) ?? 0) >= def.maxPerSession) {
      return { kind: 'drop' };
    }
    if (def.maxPerDay !== undefined && rec.dayKey === localDayKey(now) && rec.dayCount >= def.maxPerDay) {
      return { kind: 'drop' };
    }

    let wakeAt: number | undefined;
    const earliest = (t: number) => {
      wakeAt = wakeAt === undefined ? t : Math.max(wakeAt, t);
    };
    if (entry.notBefore > now) earliest(entry.notBefore);

    const cooldown = typeof def.cooldownMs === 'function' ? def.cooldownMs(entry.payload as never) : def.cooldownMs;
    if (cooldown && rec.lastShownAt !== null) {
      const due = rec.lastShownAt + cooldown;
      if (due > now) {
        // Don't hold a request open for a cooldown longer than it lives; it gets
        // re-requested on the next open/resume anyway.
        if (due > entry.expiresAt) return { kind: 'drop' };
        earliest(due);
      }
    }
    if (def.minAppAgeMs && !def.userInitiated) {
      const due = this.storage.getFirstSeen(this.userId, now) + def.minAppAgeMs;
      if (due > now) {
        if (due > entry.expiresAt) return { kind: 'drop' };
        earliest(due);
      }
    }

    const calm = def.tier === 'engagement' || def.tier === 'passive';
    if (calm && !def.userInitiated) {
      if (this.quietUntil > now) earliest(this.quietUntil);
      if (this.lastClosedAt && this.lastClosedAt + this.timing.minGapMs > now) earliest(this.lastClosedAt + this.timing.minGapMs);
    }

    const blockedBy = def.blockedBy ?? defaultBlockedBy(def);
    if (blockedBy.some((r) => this.isBusy(r))) return { kind: 'wait' };

    if (wakeAt !== undefined && wakeAt > now) return { kind: 'wait', wakeAt };
    return { kind: 'show' };
  }

  /** Pick the next popup to show, if any, and schedule a wake-up for the earliest waiting one. */
  evaluate(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    const now = this.now();

    // Drop expired / impossible entries first.
    this.queue = this.queue.filter((e) => {
      const def = this.defs.get(e.id);
      if (!def) return false;
      if (e.expiresAt <= now) {
        this.emit('expired', e.id);
        return false;
      }
      return true;
    });

    if (this.active) return;

    const ordered = [...this.queue].sort((a, b) => {
      const da = TIER_RANK[this.defs.get(a.id)!.tier];
      const db = TIER_RANK[this.defs.get(b.id)!.tier];
      return da - db || a.seq - b.seq;
    });

    let nextWake: number | undefined;
    for (const entry of ordered) {
      const def = this.defs.get(entry.id)!;
      const decision = this.decide(def, entry, now);
      if (decision.kind === 'drop') {
        this.queue = this.queue.filter((e) => e !== entry);
        this.emit('dropped', entry.id);
        continue;
      }
      if (decision.kind === 'show') {
        this.queue = this.queue.filter((e) => e !== entry);
        this.show(def, entry);
        return;
      }
      const candidate = decision.wakeAt ?? entry.expiresAt;
      nextWake = nextWake === undefined ? candidate : Math.min(nextWake, candidate);
    }

    if (nextWake !== undefined) {
      const delay = Math.max(50, nextWake - now);
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.evaluate();
      }, Math.min(delay, 2 ** 31 - 1));
    }
  }

  private show(def: PopupDefinition, entry: Entry): void {
    this.recordShown(def);
    this.active = {
      id: def.id,
      payload: entry.payload,
      key: `${def.id}:${++this.showKey}`,
      shownAt: this.now(),
    };
    this.activeTier = def.tier;
    this.emit('shown', def.id);
    this.emitChange();
    try {
      def.onShown?.(entry.payload as never);
    } catch {
      // a broken hook must never block the popup
    }
    if (def.autoCloseMs) {
      const key = this.active.key;
      this.autoCloseHandle = this.setTimer(() => {
        if (this.active?.key === key) this.close(def.id, 'dismissed');
      }, def.autoCloseMs);
    }
  }

  /** Test helper / hot-reload safety. */
  dispose(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}
