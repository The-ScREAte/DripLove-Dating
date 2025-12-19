import { supabase } from '@/integrations/supabase/client';

export type DiscoverFeedRow = Record<string, any>;

export interface GetDiscoverFeedOptions {
  limit?: number;
}

/**
 * Supabase-only Discover feed fetch.
 *
 * Preferred path: RPC `get_discover_feed(user_id uuid, limit int)`.
 * If the RPC is missing, callers can decide how to handle it.
 */
export async function getDiscoverFeed(userId: string, limit = 15): Promise<DiscoverFeedRow[]> {
  const { data, error } = await supabase.rpc('get_discover_feed' as any, {
    user_id: userId,
    limit,
  } as any);

  if (error) throw error;
  return (data as DiscoverFeedRow[]) || [];
}
