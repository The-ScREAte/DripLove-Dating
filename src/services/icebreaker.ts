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
// a mocked quota of 3 chances and a mocked successful send. Without the flag nothing changes.
export const isIcebreakerPreview = (): boolean => {
  try {
    return window.localStorage.getItem('dl_icebreaker_preview') === '1';
  } catch {
    return false;
  }
};
const PREVIEW_LIMIT = 3;
let previewUsed = 0;
function previewResponse(fn: string): unknown {
  switch (fn) {
    case 'get_icebreaker_quota':
      return { ok: true, is_premium: false, limit: PREVIEW_LIMIT, used: previewUsed, remaining: Math.max(0, PREVIEW_LIMIT - previewUsed) };
    case 'get_icebreaker_status':
      return { ok: true, matched: false, match_id: null, pending: false };
    case 'send_icebreaker':
      if (previewUsed >= PREVIEW_LIMIT) return { ok: false, error: 'quota_exhausted' };
      previewUsed += 1;
      return { ok: true, remaining: Math.max(0, PREVIEW_LIMIT - previewUsed), is_premium: false };
    case 'respond_icebreaker':
      return { ok: true, match_id: null };
    default:
      return [];
  }
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; missing: boolean; error: RpcError | null }> {
  if (isIcebreakerPreview()) {
    setAvailable(true);
    return { data: previewResponse(fn) as T, missing: false, error: null };
  }
  if (available === false) return { data: null, missing: true, error: null };
  try {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      if (isMissingBackendError(error)) {
        setAvailable(false);
        return { data: null, missing: true, error };
      }
      return { data: null, missing: false, error };
    }
    setAvailable(true);
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
}
const statusCache = new Map<string, { at: number; value: IcebreakerStatus }>();
const statusListeners = new Set<() => void>();
const emitStatus = () => statusListeners.forEach((l) => l());
export const subscribeStatus = (cb: () => void) => {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
};
export const getCachedStatus = (otherId: string): IcebreakerStatus | null => statusCache.get(otherId)?.value ?? null;

export async function loadStatus(otherId: string, force = false): Promise<IcebreakerStatus | null> {
  const hit = statusCache.get(otherId);
  if (!force && hit && Date.now() - hit.at < 30_000) return hit.value;
  const { data } = await call<{ ok?: boolean; matched?: boolean; match_id?: string | null; pending?: boolean }>('get_icebreaker_status', { p_other: otherId });
  if (data && data.ok) {
    const value: IcebreakerStatus = { matched: !!data.matched, matchId: data.match_id ?? null, pending: !!data.pending };
    statusCache.set(otherId, { at: Date.now(), value });
    emitStatus();
    return value;
  }
  return hit?.value ?? null;
}

/* ---------------------------------- send ---------------------------------- */
export type SendResult =
  | { kind: 'ok'; silent: boolean }
  | { kind: 'already_matched'; matchId: string | null }
  | { kind: 'error'; code: string }
  | { kind: 'missing' };

export async function sendIcebreaker(recipientId: string, message: string): Promise<SendResult> {
  const { data, missing, error } = await call<{ ok?: boolean; error?: string; silent?: boolean; match_id?: string; remaining?: number | null; is_premium?: boolean }>('send_icebreaker', {
    p_recipient: recipientId,
    p_message: message,
  });
  if (missing) return { kind: 'missing' };
  if (error || !data) return { kind: 'error', code: 'generic' };
  if (data.ok) {
    // Keep the shared state in step without another round trip.
    if (quota && !quota.isPremium && !data.silent) {
      const used = quota.used + 1;
      quota = { ...quota, used, remaining: data.remaining ?? (quota.limit !== null ? Math.max(0, quota.limit - used) : null) };
      emitQuota();
    }
    statusCache.set(recipientId, { at: Date.now(), value: { matched: false, matchId: null, pending: true } });
    emitStatus();
    return { kind: 'ok', silent: !!data.silent };
  }
  if (data.error === 'already_matched') {
    statusCache.set(recipientId, { at: Date.now(), value: { matched: true, matchId: data.match_id ?? null, pending: false } });
    emitStatus();
    return { kind: 'already_matched', matchId: data.match_id ?? null };
  }
  if (data.error === 'quota_exhausted' && quota && !quota.isPremium) {
    quota = { ...quota, remaining: 0, used: Math.max(quota.used, quota.limit ?? quota.used) };
    emitQuota();
  }
  if (data.error === 'already_sent') {
    statusCache.set(recipientId, { at: Date.now(), value: { matched: false, matchId: null, pending: true } });
    emitStatus();
  }
  return { kind: 'error', code: data.error || 'generic' };
}

/* ---------------------------------- inbox --------------------------------- */
export interface InboxItem {
  id: string;
  senderId: string;
  message: string;
  createdAt: string;
  firstName: string;
  age: number | null;
  city: string | null;
  isVerified: boolean;
  photoUrl: string | null;
}
interface InboxState {
  items: InboxItem[];
  loaded: boolean;
}
let inbox: InboxState = { items: [], loaded: false };
const inboxListeners = new Set<() => void>();
const emitInbox = () => inboxListeners.forEach((l) => l());
export const getInbox = (): InboxState => inbox;
export const useIcebreakerInbox = (): InboxState =>
  useSyncExternalStore(
    (cb) => {
      inboxListeners.add(cb);
      return () => inboxListeners.delete(cb);
    },
    () => inbox,
    () => inbox
  );

interface InboxRow {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  first_name: string | null;
  age: number | null;
  city: string | null;
  is_verified: boolean | null;
  photo_url: string | null;
}
export async function refreshInbox(): Promise<InboxItem[]> {
  const { data, missing } = await call<InboxRow[]>('get_icebreaker_inbox');
  if (missing) {
    inbox = { items: [], loaded: true };
    emitInbox();
    return [];
  }
  if (Array.isArray(data)) {
    inbox = {
      loaded: true,
      items: data.map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        message: r.message,
        createdAt: r.created_at,
        firstName: r.first_name || '',
        age: r.age ?? null,
        city: r.city ?? null,
        isVerified: !!r.is_verified,
        photoUrl: r.photo_url ?? null,
      })),
    };
    emitInbox();
  }
  return inbox.items;
}

/** Flat on purpose (this project's tsconfig isn't strict, so union narrowing on `ok` isn't reliable). */
export interface RespondResult {
  ok: boolean;
  matchId?: string | null;
  code?: string;
}

export async function respondIcebreaker(id: string, accept: boolean, block = false): Promise<RespondResult> {
  const { data, error, missing } = await call<{ ok?: boolean; error?: string; match_id?: string | null }>('respond_icebreaker', { p_id: id, p_accept: accept, p_block: block });
  if (missing || error || !data) return { ok: false, code: 'generic' };
  if (!data.ok) {
    if (data.error === 'not_pending' || data.error === 'expired' || data.error === 'not_found') {
      // already handled elsewhere: just drop it from the list
      inbox = { ...inbox, items: inbox.items.filter((i) => i.id !== id) };
      emitInbox();
    }
    return { ok: false, code: data.error || 'generic' };
  }
  inbox = { ...inbox, items: inbox.items.filter((i) => i.id !== id) };
  emitInbox();
  return { ok: true, matchId: data.match_id ?? null };
}

/** Test/reset helper. */
export function __resetIcebreakerForTests() {
  available = null;
  quota = null;
  quotaAt = 0;
  statusCache.clear();
  inbox = { items: [], loaded: false };
}
