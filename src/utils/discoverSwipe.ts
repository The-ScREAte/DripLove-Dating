import { supabase } from '@/integrations/supabase/client';

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase as unknown as { rpc: Rpc }).rpc(fn, args);

export interface ServerSwipe {
  /** false when the server functions aren't deployed yet - the caller then uses the older two-call path */
  available: boolean;
  data?: Record<string, unknown> | null;
  error?: unknown;
  /** the server's own answer: today's swipe count, when it gave one */
  usage: number | null;
  /** the server refused because the daily limit is used up */
  limitReached: boolean;
}

let missing = false;
const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message || ''));

const shape = (data: unknown, error: { code?: string; message?: string } | null): ServerSwipe => {
  const d = (data && typeof data === 'object' ? (data as Record<string, unknown>) : null) as Record<string, unknown> | null;
  return {
    available: true,
    data: d,
    error: error ?? undefined,
    usage: typeof d?.current_usage === 'number' ? (d.current_usage as number) : null,
    limitReached: d?.limit_reached === true,
  };
};

/**
 * Like/pass + daily-limit check + usage count in ONE database call (the plan is read on the server).
 * Falls back (available:false) until the migration is applied.
 */
export async function discoverSwipeRpc(kind: 'like' | 'pass', targetId: string): Promise<ServerSwipe> {
  if (missing) return { available: false, usage: null, limitReached: false };
  const { data, error } = await rpc('discover_swipe', { kind_param: kind, target_param: targetId });
  if (isMissing(error)) {
    missing = true;
    return { available: false, usage: null, limitReached: false };
  }
  return shape(data, error);
}

/** Undo the last pass: the server enforces the daily undo limit and gives the swipe back. */
export async function undoPassRpc(targetId: string): Promise<ServerSwipe & { undosUsed: number | null; notFound: boolean }> {
  if (missing) return { available: false, usage: null, limitReached: false, undosUsed: null, notFound: false };
  const { data, error } = await rpc('undo_pass', { target_param: targetId });
  if (isMissing(error)) {
    missing = true;
    return { available: false, usage: null, limitReached: false, undosUsed: null, notFound: false };
  }
  const base = shape(data, error);
  return {
    ...base,
    undosUsed: typeof base.data?.undos_used === 'number' ? (base.data.undos_used as number) : null,
    notFound: base.data?.error === 'not_found',
  };
}
