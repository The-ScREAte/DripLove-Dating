import type { SupabaseClient } from '@supabase/supabase-js';

export type SwipeActionType = 'like' | 'pass';

export interface SwipeOutboxItem {
  type: SwipeActionType;
  targetId: string;
  createdAt: number;
}

const keyForUser = (userId: string) => `driplove_swipe_outbox_v1_${userId}`;

const safeParse = (raw: string | null): SwipeOutboxItem[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is SwipeOutboxItem => {
        if (!x || typeof x !== 'object') return false;
        const o = x as Record<string, unknown>;
        return (
          (o.type === 'like' || o.type === 'pass') &&
          typeof o.targetId === 'string' &&
          typeof o.createdAt === 'number'
        );
      })
      .slice(0, 500);
  } catch {
    return [];
  }
};

const read = (userId: string): SwipeOutboxItem[] => {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(keyForUser(userId)));
};

const write = (userId: string, items: SwipeOutboxItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyForUser(userId), JSON.stringify(items));
  } catch {
    // ignore
  }
};

export const enqueueSwipeOutbox = (userId: string, item: SwipeOutboxItem) => {
  const existing = read(userId);

  // Dedupe by (type,targetId) — keep the earliest createdAt for stability.
  const next: SwipeOutboxItem[] = [];
  let inserted = false;
  for (const it of existing) {
    if (it.type === item.type && it.targetId === item.targetId) {
      next.push(it.createdAt <= item.createdAt ? it : item);
      inserted = true;
    } else {
      next.push(it);
    }
  }
  if (!inserted) next.push(item);

  // Keep oldest-first ordering
  next.sort((a, b) => a.createdAt - b.createdAt);
  write(userId, next);
  return next.length;
};

export const ackSwipeOutbox = (userId: string, type: SwipeActionType, targetId: string) => {
  const existing = read(userId);
  const next = existing.filter(it => !(it.type === type && it.targetId === targetId));
  if (next.length !== existing.length) write(userId, next);
  return next.length;
};

const isDuplicateInsertError = (err: unknown) => {
  const e = err as { code?: string } | null;
  return e?.code === '23505';
};

export const flushSwipeOutbox = async (opts: {
  supabase: SupabaseClient;
  userId: string;
  isPremium: boolean;
  maxItems?: number;
}): Promise<{ processed: number; remaining: number }> => {
  const { supabase, userId, isPremium, maxItems = 25 } = opts;
  const items = read(userId);
  if (items.length === 0) return { processed: 0, remaining: 0 };

  let processed = 0;

  for (const item of items.slice(0, maxItems)) {
    try {
      if (item.type === 'like') {
        const { error: rpcError } = await supabase.rpc('like_and_usage_batched', {
          liker_id_param: userId,
          liked_id_param: item.targetId,
          premium_param: isPremium,
        });

        if (rpcError) {
          // Fallback: direct insert. Treat duplicate as success.
          const { error: insertError } = await supabase.from('likes').insert({
            liker_id: userId,
            liked_id: item.targetId,
          });
          if (insertError && !isDuplicateInsertError(insertError)) throw insertError;
        }
      } else {
        const { error: rpcError } = await supabase.rpc('pass_and_usage_batched', {
          passer_id_param: userId,
          passed_id_param: item.targetId,
          premium_param: isPremium,
        });

        if (rpcError) {
          const { error: insertError } = await supabase.from('passes').insert({
            passer_id: userId,
            passed_id: item.targetId,
          });
          if (insertError && !isDuplicateInsertError(insertError)) throw insertError;
        }
      }

      ackSwipeOutbox(userId, item.type, item.targetId);
      processed += 1;
    } catch {
      // Stop on first real failure; keep remaining items.
      break;
    }
  }

  const remaining = read(userId).length;
  return { processed, remaining };
};
