import { supabase } from '@/integrations/supabase/client';
import { isMissingRpcError } from '@/utils/profileColumns';

/**
 * The signed-in user's own FULL profiles row (incl. email, zip_code,
 * face_descriptor). Calls the SECURITY DEFINER RPC get_my_profile(); if the RPC
 * does not exist yet (migration not applied) it falls back to a direct
 * select('*'), which works while table-wide SELECT is still granted.
 *
 * `userId` is only used for the fallback query (the RPC always returns the caller's row).
 */
export async function fetchMyProfile(
  userId: string,
): Promise<{ data: Record<string, any> | null; error: any }> {
  const rpc = await supabase.rpc('get_my_profile' as any).maybeSingle();
  if (!rpc.error) return { data: (rpc.data as Record<string, any> | null) ?? null, error: null };
  if (!isMissingRpcError(rpc.error)) return { data: null, error: rpc.error };

  const direct = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return { data: (direct.data as Record<string, any> | null) ?? null, error: direct.error };
}

/**
 * Save the signed-in user's own profile row without `INSERT ... ON CONFLICT DO UPDATE`.
 * PostgREST upserts read `EXCLUDED.<col>` for every payload column, which needs SELECT
 * on those columns - and email / zip_code are not SELECT-able after the column lockdown.
 * UPDATE (returning only `id`) first, INSERT when the row does not exist yet.
 */
export async function upsertOwnProfile(
  userId: string,
  payload: Record<string, any>,
): Promise<{ error: any }> {
  const { id: _ignored, ...rest } = payload;
  const upd = await supabase.from('profiles').update(rest as any).eq('id', userId).select('id');
  if (upd.error) return { error: upd.error };
  if (upd.data && upd.data.length > 0) return { error: null };
  const ins = await supabase.from('profiles').insert({ ...rest, id: userId } as any);
  return { error: ins.error };
}
