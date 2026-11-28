// "Break the ice" - network layer + tiny shared stores.
//
// FEATURE DETECTION: the DB objects come from a migration the owner applies after review. Until then
// every RPC fails with "function/table not found"; we remember that (in memory only, so a reload after
// applying the migration picks it up) and the whole feature hides itself - no errors, no toasts.

import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { IcebreakerQuota } from '@/utils/icebreaker';

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

/* ------------------------------ availability ------------------------------ */
// null = not probed yet, true = works, false = migration not applied
let available: boolean | null = null;
const availListeners = new Set<() => void>();
const setAvailable = (v: boolean) => {
  if (available === v) return;
  available = v;
  availListeners.forEach((l) => l());
};
export const getIcebreakerAvailable = (): boolean | null => available;
export const useIcebreakerAvailable = (): boolean | null =>
  useSyncExternalStore(
    (cb) => {
      availListeners.add(cb);
      return () => availListeners.delete(cb);
    },
    () => available,
    () => null
  );

/* ------------------------------ QA preview mode ----------------------------- */
// Lets the owner SEE the real popup before the migration is applied: open the app with
// ?icebreakerPreview=1 (or set localStorage dl_icebreaker_preview = '1'). Nothing touches the network:
// a mocked quota, a mocked successful send and a mocked 24h clock in every open chat. Without the flag nothing changes.
export const isIcebreakerPreview = (): boolean => {
  try {
    return window.localStorage.getItem('dl_icebreaker_preview') === '1';
  } catch {
    return false;
  }
};
const PREVIEW_LIMIT = 10;
let previewUsed = 0;
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
// The mocked hellos keep FIXED deadlines (counted from the first preview call), so a refresh never restarts their timers.
let previewBase = 0;
const previewAt = (h: number) => {
  if (!previewBase) previewBase = Date.now();
  return new Date(previewBase + h * 3600_000).toISOString();
};
const PREVIEW_ME = '__preview_me__';
// QA only: localStorage dl_icebreaker_preview_case = 'limit' | 'matched' | 'missing' | 'sender' | 'nochat' forces that state
// ('sender' = the open chat's hello is mine, 'nochat' = no running 24h clock in the chat).
const previewCase = (): string => {
  try {
    return window.localStorage.getItem('dl_icebreaker_preview_case') || '';
  } catch {
    return '';
  }
};
function previewResponse(fn: string): unknown {
  const c = previewCase();
  if (c === 'limit' && previewUsed < PREVIEW_LIMIT) previewUsed = PREVIEW_LIMIT;
  if (fn === 'send_icebreaker' && c === 'matched') return { ok: false, error: 'already_matched', match_id: null };
  switch (fn) {
    case 'get_icebreaker_quota':
      return { ok: true, is_premium: false, limit: PREVIEW_LIMIT, used: previewUsed, remaining: Math.max(0, PREVIEW_LIMIT - previewUsed), resets_at: previewUsed ? hoursFromNow(24 * 6 + 4) : null };
    case 'get_icebreaker_status':
      return { ok: true, matched: false, match_id: null, pending: false, expires_at: null };
    case 'send_icebreaker':
      if (previewUsed >= PREVIEW_LIMIT) return { ok: false, error: 'quota_exhausted', resets_at: hoursFromNow(24 * 6 + 4) };
      previewUsed += 1;
      // No real conversation exists in preview, so there is no match_id to open (the Chat list opens instead).
      return { ok: true, id: 'preview-hello', match_id: null, remaining: Math.max(0, PREVIEW_LIMIT - previewUsed), limit: PREVIEW_LIMIT, is_premium: false, expires_at: hoursFromNow(24), resets_at: hoursFromNow(24 * 7) };
    case 'get_icebreaker_for_match':
      if (c === 'nochat') return { pending: false };
      return { pending: true, expires_at: previewAt(21.5), sender_id: c === 'sender' ? PREVIEW_ME : 'prev-user-1', recipient_id: c === 'sender' ? 'prev-user-1' : PREVIEW_ME };
    case 'get_icebreaker_pending_targets':
      return [];
    default:
      return [];
  }
}
/** `probe: false` = a missing function only means THIS call is unavailable (a newer RPC on an older backend); the rest of
 *  the feature stays on. */
async function call<T>(fn: string, args?: Record<string, unknown>, opts: { probe?: boolean } = {}): Promise<{ data: T | null; missing: boolean; error: RpcError | null }> {
  const probe = opts.probe !== false;
  if (isIcebreakerPreview()) {
    if (previewCase() === 'missing') {
      setAvailable(false);
      return { data: null, missing: true, error: null };
    }
    setAvailable(true);
    return { data: previewResponse(fn) as T, missing: false, error: null };
  }
  if (available === false) return { data: null, missing: true, error: null };
  try {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      if (isMissingBackendError(error)) {
        if (probe) setAvailable(false);
        return { data: null, missing: true, error };
      }
      return { data: null, missing: false, error };
    }
    if (probe) setAvailable(true);
    return { data: data as T, missing: false, error: null };
  } catch (e) {
    return { data: null, missing: false, error: { message: e instanceof Error ? e.message : 'network' } };
  }
}

/* --------------------------------- quota ---------------------------------- */
interface QuotaRow {
  ok?: boolean;
  is_premium?: boolean;
  limit?: number | null;
  used?: number;
  remaining?: number | null;
  resets_at?: string | null;
}
let quota: IcebreakerQuota | null = null;
let quotaAt = 0;
const quotaListeners = new Set<() => void>();
const emitQuota = () => quotaListeners.forEach((l) => l());
export const getQuota = (): IcebreakerQuota | null => quota;
export const useIcebreakerQuota = (): IcebreakerQuota | null =>
  useSyncExternalStore(
    (cb) => {
      quotaListeners.add(cb);
      return () => quotaListeners.delete(cb);
    },
    () => quota,
    () => null
  );

export async function loadQuota(force = false): Promise<IcebreakerQuota | null> {
  if (!force && quota && Date.now() - quotaAt < 60_000) return quota;
  const { data } = await call<QuotaRow>('get_icebreaker_quota');
  if (data && data.ok) {
    quota = {
      isPremium: !!data.is_premium,
      limit: data.limit ?? null,
      used: Number(data.used ?? 0),
      remaining: data.remaining ?? null,
      resetsAt: data.resets_at ?? null,
    };
    quotaAt = Date.now();
    emitQuota();
  }
  return quota;
}

/* ----------------------- per-person status (matched / sent) ---------------- */
export interface IcebreakerStatus {
  matched: boolean;
  matchId: string | null;
  pending: boolean;
  /** When the waiting hello runs out (24h after it was sent). */
  expiresAt?: string | null;
}
const statusCache = new Map<string, { at: number; value: IcebreakerStatus }>();
const statusListeners = new Set<() => void>();
const emitStatus = () => statusListeners.forEach((l) => l());
export const subscribeStatus = (cb: () => void) => {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
};
export const getCachedStatus = (otherId: string): IcebreakerStatus | null => {
  const hit = statusCache.get(otherId);
  const v = hit?.value ?? null;
  // A hello whose 24 hours are over is no longer "waiting": the person is back in the queue and can be written to again.
  // The settled value is stored back so this stays a STABLE snapshot for useSyncExternalStore (a fresh object on every
  // call would make React re-render forever).
  if (hit && v?.pending && v.expiresAt && new Date(v.expiresAt).getTime() <= Date.now()) {
    const settled: IcebreakerStatus = { ...v, pending: false, expiresAt: null };
    statusCache.set(otherId, { at: hit.at, value: settled });
    return settled;
  }
  return v;
};

export async function loadStatus(otherId: string, force = false): Promise<IcebreakerStatus | null> {
  const hit = statusCache.get(otherId);
  if (!force && hit && Date.now() - hit.at < 30_000) return hit.value;
  const { data } = await call<{ ok?: boolean; matched?: boolean; match_id?: string | null; pending?: boolean; expires_at?: string | null }>('get_icebreaker_status', { p_other: otherId });
  if (data && data.ok) {
    const value: IcebreakerStatus = { matched: !!data.matched, matchId: data.match_id ?? null, pending: !!data.pending, expiresAt: data.expires_at ?? null };
    statusCache.set(otherId, { at: Date.now(), value });
    emitStatus();
    return value;
  }
  return hit?.value ?? null;
}

/* ---------------------------------- send ---------------------------------- */
// A hello is a normal chat: the server opens the conversation, puts the hello in as its first message and starts the
// 24 hour clock. The other person answers by simply replying there.
export type SendResult =
  | { kind: 'ok'; silent: boolean; matchId: string | null }
  | { kind: 'already_matched'; matchId: string | null }
  | { kind: 'error'; code: string }
  | { kind: 'missing' };

interface SendRow {
  ok?: boolean;
  error?: string;
  silent?: boolean;
  id?: string;
  match_id?: string | null;
  remaining?: number | null;
  limit?: number | null;
  is_premium?: boolean;
  expires_at?: string | null;
  resets_at?: string | null;
}

const DAY_MS = 24 * 3600_000;

export async function sendIcebreaker(recipientId: string, message: string): Promise<SendResult> {
  const { data, missing, error } = await call<SendRow>('send_icebreaker', {
    p_recipient: recipientId,
    p_message: message,
  });
  if (missing) return { kind: 'missing' };
  if (error || !data) return { kind: 'error', code: 'generic' };
  if (data.ok) {
    // Keep the shared state in step without another round trip.
    if (!data.silent) {
      const limit = data.limit ?? quota?.limit ?? null;
      const remaining = data.remaining ?? (quota && quota.limit !== null ? Math.max(0, quota.limit - (quota.used + 1)) : null);
      quota = {
        isPremium: !!(data.is_premium ?? quota?.isPremium),
        limit,
        used: limit !== null && remaining !== null ? Math.max(0, limit - remaining) : (quota?.used ?? 0) + 1,
        remaining,
        resetsAt: data.resets_at ?? quota?.resetsAt ?? null,
      };
      quotaAt = Date.now();
      emitQuota();
    }
    // A silent success (blocked / they said no before) must look like a normal send to the sender: the person leaves
    // the queue (the server already keeps them out of Discover).
    pendingTargets.add(recipientId);
    emitPending();
    try {
      window.dispatchEvent(new CustomEvent('dl:icebreaker-sent', { detail: { id: recipientId } }));
    } catch {
      /* not in a browser */
    }
    const matchId = data.match_id ?? null;
    const expiresAt = data.expires_at ?? new Date(Date.now() + DAY_MS).toISOString();
    // With a conversation the profile simply offers "Open chat"; without one (silent / older backend) it reads "sent".
    statusCache.set(recipientId, { at: Date.now(), value: { matched: !!matchId, matchId, pending: true, expiresAt } });
    emitStatus();
    return { kind: 'ok', silent: !!data.silent, matchId };
  }
  if (data.error === 'already_matched') {
    statusCache.set(recipientId, { at: Date.now(), value: { matched: true, matchId: data.match_id ?? null, pending: false } });
    emitStatus();
    return { kind: 'already_matched', matchId: data.match_id ?? null };
  }
  if (data.error === 'quota_exhausted' && quota) {
    quota = { ...quota, remaining: 0, used: Math.max(quota.used, quota.limit ?? quota.used), resetsAt: data.resets_at ?? quota.resetsAt ?? null };
    emitQuota();
  }
  if (data.error === 'already_sent') {
    statusCache.set(recipientId, { at: Date.now(), value: { matched: false, matchId: null, pending: true } });
    emitStatus();
  }
  return { kind: 'error', code: data.error || 'generic' };
}

/* --------------------- the running 24h clock of one conversation --------------------- */
export interface MatchIcebreaker {
  /** A hello in this chat still waits for its first reply. */
  pending: boolean;
  expiresAt: string | null;
  /** I sent the hello (false = it was sent to me). */
  mine: boolean;
}

/**
 * Is there a hello waiting for a reply in this conversation? null = unknown (backend without this function yet, or a
 * network error) - callers then show nothing.
 */
export async function getIcebreakerForMatch(matchId: string, myId?: string | null): Promise<MatchIcebreaker | null> {
  if (!matchId) return null;
  const { data, missing, error } = await call<{ pending?: boolean; expires_at?: string | null; sender_id?: string | null; recipient_id?: string | null }>(
    'get_icebreaker_for_match',
    { p_match: matchId },
    { probe: false }
  );
  if (missing || error || !data) return null;
  if (!data.pending || !data.expires_at || new Date(data.expires_at).getTime() <= Date.now()) return { pending: false, expiresAt: null, mine: false };
  const me = isIcebreakerPreview() ? PREVIEW_ME : myId;
  return { pending: true, expiresAt: data.expires_at, mine: !!me && data.sender_id === me };
}

/* --------------- people kept out of my queue while their hello waits ---------------- */
const pendingTargets = new Set<string>();
const pendingListeners = new Set<() => void>();
const emitPending = () => pendingListeners.forEach((l) => l());
export const subscribePending = (cb: () => void) => {
  pendingListeners.add(cb);
  return () => pendingListeners.delete(cb);
};
/** Ids Discover should leave out right now: someone I wrote to who has not answered yet (or who said no). */
export const getPendingTargetIds = (): string[] => Array.from(pendingTargets);
export async function loadPendingTargets(): Promise<string[]> {
  const { data } = await call<string[]>('get_icebreaker_pending_targets');
  if (Array.isArray(data)) {
    pendingTargets.clear();
    data.forEach((id) => pendingTargets.add(String(id)));
    emitPending();
  }
  return getPendingTargetIds();
}

/** Logout / user switch + tests: forget every cached quota, status and pending target. */
export function resetIcebreakerState() {
  available = null;
  quota = null;
  quotaAt = 0;
  statusCache.clear();
  pendingTargets.clear();
}
export const __resetIcebreakerForTests = resetIcebreakerState;
