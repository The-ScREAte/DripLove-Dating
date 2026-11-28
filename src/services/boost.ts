// Boost - network layer + tiny shared stores (same pattern as src/services/icebreaker.ts).
//
// A boost puts me at the front of other people's Discover queue for a while (free: 15 min, once a day; premium: 20 min,
// again and again, one at a time).
//
// FEATURE DETECTION: the RPCs come from a migration the owner applies after review. Until then every call fails with
// "function not found"; we remember that (in memory only, so a reload after applying the migration picks it up) and
// the whole feature hides itself - no errors, no toasts.
//
// QA PREVIEW: localStorage dl_boost_preview = '1' mocks every call (nothing touches the network), so the button,
// launch animation, top timer, sheet, toasts and badges can be reviewed before the backend exists.
//   dl_boost_preview_case    = 'premium' | 'free_used' | 'missing'   (default: free user with a boost available)
//   dl_boost_preview_seconds = '20'  -> boosts last 20 seconds instead of 15/20 minutes (to see the end state)

import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FREE_BOOST_MINUTES, PREMIUM_BOOST_MINUTES, BOOST_WIN_LABEL_DAYS, toMs } from '@/utils/boost';

interface RpcError {
  code?: string;
  message?: string;
}
interface LooseClient {
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: RpcError | null }>;
}
// The generated Database types don't know the new functions yet (they're added by the migration).
const sb = supabase as unknown as LooseClient;

const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01', '404']);
export const isMissingBackendError = (e: RpcError | null | undefined): boolean =>
  !!e && (MISSING_CODES.has(String(e.code)) || /could not find the (function|table)|does not exist|schema cache/i.test(e.message || ''));

/* --------------------------------- tiny store helper --------------------------------- */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
type Store<T> = ReturnType<typeof createStore<T>>;
function useStore<T>(store: Store<T>, server: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => server);
}

/* ------------------------------------ preview ------------------------------------ */
const ls = (k: string): string | null => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string | null) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};
export const isBoostPreview = (): boolean => ls('dl_boost_preview') === '1';
const previewCase = (): string => ls('dl_boost_preview_case') || '';
const previewDurationMs = (premium: boolean): number => {
  const s = Number(ls('dl_boost_preview_seconds'));
  if (Number.isFinite(s) && s > 0) return s * 1000;
  return (premium ? PREMIUM_BOOST_MINUTES : FREE_BOOST_MINUTES) * 60_000;
};
const PREVIEW_STATE_KEY = 'dl_boost_preview_state';
interface PreviewState {
  endsAt: number | null;
  boostId: string | null;
  freeUsedAt: number | null;
}
const readPreview = (): PreviewState => {
  try {
    const raw = ls(PREVIEW_STATE_KEY);
    if (raw) return { endsAt: null, boostId: null, freeUsedAt: null, ...(JSON.parse(raw) as Partial<PreviewState>) };
  } catch {
    /* ignore */
  }
  return { endsAt: null, boostId: null, freeUsedAt: null };
};
const writePreview = (s: PreviewState) => lsSet(PREVIEW_STATE_KEY, JSON.stringify(s));
const DAY_MS = 24 * 3600_000;

function previewResponse(fn: string): unknown {
  const premium = previewCase() === 'premium';
  const st = readPreview();
  const now = Date.now();
  const active = !!st.endsAt && st.endsAt > now;
  const freeUsedAt = previewCase() === 'free_used' ? st.freeUsedAt ?? now - 19 * 3600_000 : st.freeUsedAt;
  const nextFreeAt = !premium && freeUsedAt && freeUsedAt + DAY_MS > now ? freeUsedAt + DAY_MS : null;
  const durationMinutes = premium ? PREMIUM_BOOST_MINUTES : FREE_BOOST_MINUTES;
  switch (fn) {
    case 'get_my_boost':
      return {
        active,
        boost_id: active ? st.boostId : null,
        kind: active ? (premium ? 'premium' : 'free') : null,
        ends_at: active ? new Date(st.endsAt as number).toISOString() : null,
        is_premium: premium,
        duration_minutes: durationMinutes,
        can_activate: !active && (premium || !nextFreeAt),
        next_free_at: nextFreeAt ? new Date(nextFreeAt).toISOString() : null,
      };
    case 'activate_boost': {
      if (active) return { ok: false, error: 'already_active', ends_at: new Date(st.endsAt as number).toISOString() };
      if (!premium && nextFreeAt) return { ok: false, error: 'free_used', next_free_at: new Date(nextFreeAt).toISOString() };
      const endsAt = now + previewDurationMs(premium);
      const boostId = `preview-${now}`;
      writePreview({ endsAt, boostId, freeUsedAt: premium ? st.freeUsedAt : now });
      // A like "arrives" a few seconds in, so the toast can be reviewed.
      setTimeout(() => {
        previewWins.unshift({ kind: 'like', fromUser: '__preview_liker__', createdAt: Date.now(), boostId });
      }, 6000);
      return { ok: true, boost_id: boostId, kind: premium ? 'premium' : 'free', started_at: new Date(now).toISOString(), ends_at: new Date(endsAt).toISOString(), duration_minutes: durationMinutes };
    }
    case 'get_boosted_profiles_for_me':
      return [];
    case 'get_boost_wins':
      return previewWins.map((w) => ({ kind: w.kind, from_user: w.fromUser, created_at: new Date(w.createdAt).toISOString(), boost_id: w.boostId }));
    default:
      return null;
  }
}
const previewWins: BoostWin[] = [];
/** Preview only: a stable ~1 in 3 of the people in Liked Me / Chat wear the badge, so it can be reviewed. */
const previewWinFor = (userId: string): BoostWin | null => {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return Math.abs(h) % 3 === 0 ? { kind: 'like', fromUser: userId, createdAt: Date.now() - 3600_000, boostId: 'preview' } : null;
};

/* ------------------------------ availability ------------------------------ */
// null = not probed yet, true = works, false = migration not applied
const availableStore = createStore<boolean | null>(null);
export const getBoostAvailable = (): boolean | null => availableStore.get();
export const useBoostAvailable = (): boolean | null => useStore(availableStore, null);

async function call<T>(fn: string, args?: Record<string, unknown>, opts: { probe?: boolean } = {}): Promise<{ data: T | null; missing: boolean; error: RpcError | null }> {
  const probe = opts.probe !== false;
  if (isBoostPreview()) {
    if (previewCase() === 'missing') {
      availableStore.set(false);
      return { data: null, missing: true, error: null };
    }
    availableStore.set(true);
    return { data: previewResponse(fn) as T, missing: false, error: null };
  }
  if (availableStore.get() === false) return { data: null, missing: true, error: null };
  try {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      if (isMissingBackendError(error)) {
        if (probe) availableStore.set(false);
        return { data: null, missing: true, error };
      }
      return { data: null, missing: false, error };
    }
    if (probe) availableStore.set(true);
    return { data: data as T, missing: false, error: null };
  } catch (e) {
    return { data: null, missing: false, error: { message: e instanceof Error ? e.message : 'network' } };
  }
}

/* --------------------------------- my boost --------------------------------- */
export type BoostKind = 'free' | 'premium';
export interface BoostStatus {
  active: boolean;
  boostId: string | null;
  kind: BoostKind | null;
  /** ms epoch */
  endsAt: number | null;
  isPremium: boolean;
  durationMinutes: number;
  canActivate: boolean;
  /** ms epoch; free users only */
  nextFreeAt: number | null;
}
interface MyBoostRow {
  active?: boolean;
  boost_id?: string | null;
  kind?: string | null;
  ends_at?: string | null;
  is_premium?: boolean;
  duration_minutes?: number | null;
  can_activate?: boolean;
  next_free_at?: string | null;
}
const statusStore = createStore<BoostStatus | null>(null);
export const getBoostStatus = () => statusStore.get();
export const useBoostStatus = (): BoostStatus | null => useStore(statusStore, null);

const normalizeKind = (k: unknown): BoostKind | null => (k === 'premium' ? 'premium' : k === 'free' ? 'free' : null);

function setStatus(next: BoostStatus | null) {
  // A boost whose end time is already past is not active, whatever a slow response says.
  if (next && next.active && (!next.endsAt || next.endsAt <= Date.now())) next = { ...next, active: false };
  statusStore.set(next);
  scheduleEnd();
}

let statusAt = 0;
let statusInFlight: Promise<BoostStatus | null> | null = null;
export async function loadBoost(force = false): Promise<BoostStatus | null> {
  if (!force && statusStore.get() && Date.now() - statusAt < 30_000) return statusStore.get();
  if (statusInFlight) return statusInFlight;
  statusInFlight = (async () => {
    const { data } = await call<MyBoostRow | MyBoostRow[]>('get_my_boost');
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === 'object') {
      const isPremium = !!row.is_premium;
      setStatus({
        active: !!row.active,
        boostId: row.boost_id ?? null,
        kind: normalizeKind(row.kind),
        endsAt: toMs(row.ends_at),
        isPremium,
        durationMinutes: Number(row.duration_minutes) || (isPremium ? PREMIUM_BOOST_MINUTES : FREE_BOOST_MINUTES),
        canActivate: !!row.can_activate,
        nextFreeAt: toMs(row.next_free_at),
      });
      statusAt = Date.now();
    }
    return statusStore.get();
  })().finally(() => {
    statusInFlight = null;
  });
  return statusInFlight;
}

/* ------------------------------ ending on time ------------------------------ */
// The clock runs locally: the moment ends_at passes the boost is over (top timer leaves, button comes back / shows the
// wait), then the server is asked again for the real next state.
let endTimer: ReturnType<typeof setTimeout> | null = null;
const endedListeners = new Set<(s: BoostStatus) => void>();
export const onBoostEnded = (cb: (s: BoostStatus) => void) => {
  endedListeners.add(cb);
  return () => {
    endedListeners.delete(cb);
  };
};
function scheduleEnd() {
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  const s = statusStore.get();
  if (!s || !s.active || !s.endsAt) return;
  const wait = Math.max(0, s.endsAt - Date.now());
  // setTimeout caps at ~24.8 days; boosts are minutes long, but stay safe.
  endTimer = setTimeout(() => {
    endTimer = null;
    const cur = statusStore.get();
    if (!cur || !cur.active || !cur.endsAt || cur.endsAt > Date.now() + 250) {
      scheduleEnd();
      return;
    }
    const ended = cur;
    statusStore.set({
      ...cur,
      active: false,
      // Premium can go again right away; a free user waits for the next day (the server confirms below).
      canActivate: cur.isPremium,
      nextFreeAt: cur.isPremium ? null : cur.nextFreeAt,
    });
    lastEndedAt = Date.now();
    endedListeners.forEach((l) => l(ended));
    setTimeout(() => void loadBoost(true), 1500);
  }, Math.min(wait, 2_000_000_000));
}
let lastEndedAt = 0;
export const getLastBoostEndedAt = () => lastEndedAt;

/* ---------------------------------- activate ---------------------------------- */
export type ActivateResult =
  | { kind: 'ok'; status: BoostStatus }
  | { kind: 'already_active' }
  | { kind: 'free_used'; nextFreeAt: number | null }
  | { kind: 'error'; code: string }
  | { kind: 'missing' };

interface ActivateRow {
  ok?: boolean;
  error?: string;
  boost_id?: string | null;
  kind?: string | null;
  started_at?: string | null;
  ends_at?: string | null;
  duration_minutes?: number | null;
  next_free_at?: string | null;
}

/** `launchFrom`: where the tapped control is - the launch animation is started BEFORE the boost turns active, so the
 *  header timer waits for the bolt to land instead of flashing in first. */
export async function activateBoost(opts: { launchFrom?: BoostLaunch['from'] } = {}): Promise<ActivateResult> {
  const { data, missing, error } = await call<ActivateRow | ActivateRow[]>('activate_boost');
  if (missing) return { kind: 'missing' };
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return { kind: 'error', code: 'generic' };
  const prev = statusStore.get();
  if (row.ok) {
    const kind = normalizeKind(row.kind) ?? (prev?.isPremium ? 'premium' : 'free');
    const durationMinutes = Number(row.duration_minutes) || (kind === 'premium' ? PREMIUM_BOOST_MINUTES : FREE_BOOST_MINUTES);
    const endsAt = toMs(row.ends_at) ?? Date.now() + durationMinutes * 60_000;
    const next: BoostStatus = {
      active: true,
      boostId: row.boost_id ?? null,
      kind,
      endsAt,
      isPremium: prev?.isPremium ?? kind === 'premium',
      durationMinutes,
      canActivate: false,
      nextFreeAt: kind === 'free' ? endsAt - durationMinutes * 60_000 + DAY_MS : prev?.nextFreeAt ?? null,
    };
    if (opts.launchFrom) startBoostLaunch(opts.launchFrom);
    setStatus(next);
    statusAt = Date.now();
    winsWatchUntil = endsAt + 10 * 60_000;
    return { kind: 'ok', status: next };
  }
  if (row.error === 'already_active') {
    void loadBoost(true);
    return { kind: 'already_active' };
  }
  if (row.error === 'free_used') {
    const nextFreeAt = toMs(row.next_free_at);
    if (prev) setStatus({ ...prev, active: false, canActivate: false, nextFreeAt: nextFreeAt ?? prev.nextFreeAt });
    return { kind: 'free_used', nextFreeAt };
  }
  return { kind: 'error', code: row.error || 'generic' };
}

/* ------------------------- boosted people for MY deck ------------------------- */
export interface BoostedProfileRow {
  profileId: string;
  endsAt: number | null;
}
/** People currently boosted who fit me - Discover puts them a card or two ahead. [] when unavailable. */
export async function getBoostedProfilesForMe(limit = 5): Promise<BoostedProfileRow[]> {
  // probe: false - a missing read-side function must not hide my own Boost button.
  const { data } = await call<Array<{ profile_id?: string; ends_at?: string | null }>>('get_boosted_profiles_for_me', { p_limit: limit }, { probe: false });
  if (!Array.isArray(data)) return [];
  const now = Date.now();
  return data
    .map((r) => ({ profileId: String(r?.profile_id || ''), endsAt: toMs(r?.ends_at) }))
    .filter((r) => r.profileId && (r.endsAt === null || r.endsAt > now));
}

/* ------------------------------ "Boost got you this" ------------------------------ */
export interface BoostWin {
  kind: 'like' | 'message';
  fromUser: string;
  /** ms epoch */
  createdAt: number;
  boostId: string | null;
}
// Latest win per person.
const winsStore = createStore<Map<string, BoostWin>>(new Map());
let winsAll: BoostWin[] = [];
let winsLoadedSince: number | null = null;
let winsWatchUntil = 0;

export const useBoostWins = (): Map<string, BoostWin> => useStore(winsStore, winsStore.get());
/** The win that brought this person to me, if any (null = no label). */
export function useBoostWin(userId: string | null | undefined): BoostWin | null {
  const map = useBoostWins();
  const available = useBoostAvailable();
  if (!userId || available !== true) return null;
  if (isBoostPreview()) return map.get(userId) ?? previewWinFor(userId);
  return map.get(userId) ?? null;
}
/** Likes / messages that came during one boost. */
export function countWinsForBoost(boostId: string | null | undefined): { likes: number; messages: number } {
  let likes = 0;
  let messages = 0;
  if (!boostId) return { likes, messages };
  const seen = new Set<string>();
  for (const w of winsAll) {
    if (w.boostId !== boostId) continue;
    const key = `${w.kind}:${w.fromUser}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (w.kind === 'like') likes++;
    else messages++;
  }
  return { likes, messages };
}

/** New wins since the last check get a light toast - the host listens. */
const winListeners = new Set<(fresh: BoostWin[]) => void>();
export const onNewBoostWins = (cb: (fresh: BoostWin[]) => void) => {
  winListeners.add(cb);
  return () => {
    winListeners.delete(cb);
  };
};

let currentUserId: string | null = null;
const markKey = () => `dl_boost_win_mark:${currentUserId || 'anon'}`;

export async function loadBoostWins(): Promise<void> {
  const now = Date.now();
  const since = winsLoadedSince ?? now - BOOST_WIN_LABEL_DAYS * DAY_MS;
  const { data } = await call<Array<{ kind?: string; from_user?: string; created_at?: string; boost_id?: string | null }>>(
    'get_boost_wins',
    { p_since: new Date(since).toISOString() },
    { probe: false }
  );
  if (!Array.isArray(data)) return;
  const incoming: BoostWin[] = data
    .map((r) => ({
      kind: (r?.kind === 'message' ? 'message' : 'like') as BoostWin['kind'],
      fromUser: String(r?.from_user || ''),
      createdAt: toMs(r?.created_at) ?? now,
      boostId: r?.boost_id ?? null,
    }))
    .filter((w) => w.fromUser);
  const key = (w: BoostWin) => `${w.kind}:${w.fromUser}:${w.createdAt}`;
  const known = new Set(winsAll.map(key));
  const added = incoming.filter((w) => !known.has(key(w)));
  if (added.length) {
    winsAll = [...winsAll, ...added].sort((a, b) => a.createdAt - b.createdAt);
    const map = new Map<string, BoostWin>();
    for (const w of winsAll) map.set(w.fromUser, w);
    winsStore.set(map);
  }
  // Next poll asks only for what is newer (a minute of overlap for clock skew; duplicates are dropped above).
  const newest = winsAll.length ? winsAll[winsAll.length - 1].createdAt : since;
  winsLoadedSince = Math.max(since, newest - 60_000);

  // Toast only what is newer than the last thing this device was told about (first run: nothing old).
  const markRaw = Number(ls(markKey()));
  const mark = Number.isFinite(markRaw) && markRaw > 0 ? markRaw : null;
  if (mark === null) {
    lsSet(markKey(), String(Math.max(now, newest)));
    return;
  }
  const fresh = added.filter((w) => w.createdAt > mark);
  if (fresh.length) {
    lsSet(markKey(), String(Math.max(...fresh.map((w) => w.createdAt))));
    winListeners.forEach((l) => l(fresh));
  }
}
/** Should wins be polled right now? While boosted and for a while after (likes keep coming in). */
export const shouldWatchWins = (): boolean => {
  const s = statusStore.get();
  return (!!s && s.active) || Date.now() < winsWatchUntil;
};

/* ------------------------------ UI-only stores ------------------------------ */
export interface BoostLaunch {
  id: number;
  /** Where the tapped button is (viewport px), so the bolt starts there. */
  from: { x: number; y: number; size: number };
  /** The bolt has reached the top: the timer pill takes over (the animation still finishes its flash). */
  arrived: boolean;
}
const launchStore = createStore<BoostLaunch | null>(null);
export const useBoostLaunch = () => useStore(launchStore, null);
let launchSeq = 0;
export const startBoostLaunch = (from: BoostLaunch['from']) => launchStore.set({ id: ++launchSeq, from, arrived: false });
export const markBoostLaunchArrived = () => {
  const cur = launchStore.get();
  if (cur && !cur.arrived) launchStore.set({ ...cur, arrived: true });
};
export const endBoostLaunch = () => launchStore.set(null);

/** A tapped boost push ("Boost is on", "Your boost has ended", "Good time to boost"): once my state is known, open
 *  the sheet if a boost can be started; a running boost already shows in the header timer. */
const focusStore = createStore<number>(0);
export const useBoostFocusRequest = () => useStore(focusStore, 0);
export const requestBoostFocus = () => focusStore.set(focusStore.get() + 1);
export const clearBoostFocus = () => focusStore.set(0);

const sheetStore = createStore<boolean>(false);
export const useBoostSheetOpen = () => useStore(sheetStore, false);
export const openBoostSheet = () => sheetStore.set(true);
export const closeBoostSheet = () => sheetStore.set(false);

interface BoostHandlers {
  openPremium?: () => void;
}
let handlers: BoostHandlers = {};
export const setBoostHandlers = (h: BoostHandlers) => {
  handlers = h;
};
export const getBoostHandlers = () => handlers;

/** Logout / user switch + tests. */
export function setBoostUser(userId: string | null | undefined) {
  const id = userId || null;
  if (id === currentUserId) return;
  currentUserId = id;
  resetBoostState();
}
export function resetBoostState() {
  availableStore.set(null);
  statusStore.set(null);
  statusAt = 0;
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  winsAll = [];
  winsLoadedSince = null;
  winsWatchUntil = 0;
  winsStore.set(new Map());
  launchStore.set(null);
  sheetStore.set(false);
  // focusStore survives on purpose: a tapped boost push is requested before the user id is known on a cold start.
}
