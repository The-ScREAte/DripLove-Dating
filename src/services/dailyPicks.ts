// "Your 5 picks for today" - network layer only (no UI).
//
// Backed by supabase/migrations/20261128180000_daily_five_picks.sql: get_my_daily_picks() returns the
// signed-in user's set for their local day (built on first call, then stable all day): 4 people inside
// their range + 1 just outside it (age or distance), in display order. The same set drives the midday
// and evening recommendation pushes, so a tap on either lands on someone from this list.
//
// FEATURE DETECTION: until the migration is applied the RPC doesn't exist; fetchDailyPicks() then
// resolves to { available: false } (remembered in memory, so a reload after applying picks it up).

import { supabase } from '@/integrations/supabase/client';

interface RpcError {
  code?: string;
  message?: string;
}
interface LooseClient {
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: RpcError | null }>;
}
// The generated Database types don't know get_my_daily_picks yet.
const sb = supabase as unknown as LooseClient;

const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01', '404']);
const isMissing = (e: RpcError | null | undefined): boolean =>
  !!e && (MISSING_CODES.has(String(e.code)) || /could not find the (function|table)|does not exist|schema cache/i.test(e.message || ''));

export interface DailyPickRow {
  profile_id: string;
  slot: number;
  is_out_of_range: boolean;
  out_of_range_reason: 'age' | 'distance' | null;
  age: number | null;
  distance_km: number | null;
  shared_trait: string | null;
  is_decided: boolean;
  is_away: boolean;
  pick_date: string;
}

export interface DailyPick extends DailyPickRow {
  first_name: string | null;
  city: string | null;
  photo: string | null;
}

export type DailyPicksResult =
  | { available: false }
  | { available: true; pickDate: string | null; picks: DailyPick[]; error?: string };

let missing = false;

// Short label for the "just outside your range" card, e.g. on a small chip.
export const outOfRangeLabel = (p: Pick<DailyPickRow, 'is_out_of_range' | 'out_of_range_reason'>): string | null => {
  if (!p.is_out_of_range) return null;
  return p.out_of_range_reason === 'age' ? 'Just outside your age range' : 'A little further than usual';
};

// Undecided picks only (liked/passed/matched/blocked ones drop out as the day goes on), in order.
export const visiblePicks = <T extends Pick<DailyPickRow, 'is_decided'>>(rows: T[]): T[] => rows.filter((r) => !r.is_decided);

export async function fetchDailyPicks(): Promise<DailyPicksResult> {
  if (missing) return { available: false };
  try {
    const { data, error } = await sb.rpc('get_my_daily_picks');
    if (error) {
      if (isMissing(error)) {
        missing = true;
        return { available: false };
      }
      return { available: true, pickDate: null, picks: [], error: error.message || 'error' };
    }
    const rows = visiblePicks(Array.isArray(data) ? (data as DailyPickRow[]) : []);
    if (rows.length === 0) return { available: true, pickDate: null, picks: [] };

    const ids = rows.map((r) => r.profile_id);
    // Archived people are allowed in the set (ranked last), so no is_archived filter here.
    const [{ data: profiles }, { data: images }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, city').in('id', ids),
      supabase
        .from('user_images')
        .select('user_id, image_url, image_order')
        .in('user_id', ids)
        .eq('is_approved', true)
        .neq('image_order', -1)
        .order('image_order', { ascending: true }),
    ]);
    const byId = new Map((profiles || []).map((p) => [p.id as string, p]));
    const photo: Record<string, string> = {};
    (images || []).forEach((r) => {
      if (!photo[r.user_id as string]) photo[r.user_id as string] = r.image_url as string;
    });

    return {
      available: true,
      pickDate: rows[0].pick_date,
      picks: rows.map((r) => ({
        ...r,
        first_name: (byId.get(r.profile_id)?.first_name as string | undefined) ?? null,
        city: (byId.get(r.profile_id)?.city as string | undefined) ?? null,
        photo: photo[r.profile_id] ?? null,
      })),
    };
  } catch (e) {
    return { available: true, pickDate: null, picks: [], error: e instanceof Error ? e.message : 'network' };
  }
}

export const __resetDailyPicksForTests = (): void => {
  missing = false;
};
