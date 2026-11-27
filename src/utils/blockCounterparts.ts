import { supabase } from '@/integrations/supabase/client';
import { blockRowsFromIds, type BlockRow } from '@/utils/blockRows';

/**
 * Everyone the viewer must not see (and who must not see the viewer): people they blocked AND people who
 * blocked them. RLS on `blocks` only lets a user read rows they created, so a plain table select silently
 * misses "they blocked me"; the get_block_counterparts RPC (SECURITY DEFINER) covers both directions.
 * Until that migration is applied we fall back to the old table select (one direction only).
 */
export async function fetchBlockRows(userId: string): Promise<{ data: BlockRow[]; error: unknown }> {
  try {
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
    }).rpc('get_block_counterparts');
    if (!error && Array.isArray(data)) return { data: blockRowsFromIds(data), error: null };
  } catch {
    // fall through to the table select
  }
  const res = await supabase
    .from('blocks')
    .select('blocked_id,blocker_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  return { data: (res.data || []) as BlockRow[], error: res.error };
}
