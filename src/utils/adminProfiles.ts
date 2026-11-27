import { supabase } from '@/integrations/supabase/client';
import { isMissingRpcError } from '@/utils/profileColumns';

/** Filters understood by both the admin_get_profiles RPC and the direct-query fallback. */
export interface AdminProfileFilters {
  is_admin?: boolean;
  is_archived?: boolean;
  /** 'not_archived' = is_archived IS NULL OR false; 'archived_only' = is_archived = true */
  archive?: 'not_archived' | 'archived_only';
  /** account_status NOT IN (...) */
  exclude_statuses?: string[];
  account_status?: string;
  gender?: string;
  preference?: string;
  relationship_intent?: string;
  /** profiles.country IN (...) */
  countries?: string[];
  /** profiles.id <> value */
  exclude_id?: string;
  country_not_null?: boolean;
  email_not_null?: boolean;
}

export interface AdminProfilesOptions {
  /** Restrict to these profile ids (omit for "all rows matching filters"). */
  ids?: string[];
  filters?: AdminProfileFilters;
  /** Page size (default 1000, RPC hard cap 1000). */
  limit?: number;
  offset?: number;
  /** Order: newest first (created_at desc, id asc) when true, id asc otherwise. */
  newestFirst?: boolean;
  /** Columns for the FALLBACK direct query only (the RPC always returns full rows). */
  fallbackColumns?: string;
}

/**
 * Admin-only read of other users' full profile rows (email, face_descriptor, ...).
 * Uses RPC admin_get_profiles; falls back to a direct profiles query when the
 * RPC is not deployed yet. Returns full rows when the RPC is used.
 */
export async function adminGetProfiles<T = Record<string, any>>(
  opts: AdminProfilesOptions = {},
): Promise<{ data: T[] | null; error: any }> {
  const limit = Math.min(opts.limit ?? 1000, 1000);
  const offset = opts.offset ?? 0;
  const filters = opts.filters ?? {};
  const newestFirst = opts.newestFirst ?? false;

  if (opts.ids && opts.ids.length === 0) return { data: [], error: null };

  const rpc = await supabase.rpc('admin_get_profiles' as any, {
    p_ids: opts.ids ?? null,
    p_limit: limit,
    p_offset: offset,
    p_filters: filters,
    p_newest_first: newestFirst,
  } as any);
  if (!rpc.error) return { data: (rpc.data as T[] | null) ?? [], error: null };
  if (!isMissingRpcError(rpc.error)) return { data: null, error: rpc.error };

  // Fallback: direct query (works until the column lockdown is applied).
  let q: any = supabase.from('profiles').select(opts.fallbackColumns ?? '*');
  if (opts.ids) q = q.in('id', opts.ids);
  if (filters.is_admin !== undefined) q = q.eq('is_admin', filters.is_admin);
  if (filters.is_archived !== undefined) q = q.eq('is_archived', filters.is_archived);
  if (filters.archive === 'not_archived') q = q.or('is_archived.is.null,is_archived.eq.false');
  if (filters.archive === 'archived_only') q = q.eq('is_archived', true);
  for (const st of filters.exclude_statuses ?? []) q = q.neq('account_status', st);
  if (filters.account_status) q = q.eq('account_status', filters.account_status);
  if (filters.gender) q = q.eq('gender', filters.gender);
  if (filters.preference) q = q.eq('preference', filters.preference);
  if (filters.relationship_intent) q = q.eq('relationship_intent', filters.relationship_intent);
  if (filters.countries && filters.countries.length > 0) q = q.in('country', filters.countries);
  if (filters.exclude_id) q = q.neq('id', filters.exclude_id);
  if (filters.country_not_null) q = q.not('country', 'is', null);
  if (filters.email_not_null) q = q.not('email', 'is', null);
  if (newestFirst) q = q.order('created_at', { ascending: false }).order('id', { ascending: true });
  else q = q.order('id', { ascending: true });
  q = q.range(offset, offset + limit - 1);
  const direct = await q;
  return { data: (direct.data as T[] | null) ?? null, error: direct.error };
}

/** Fetch every page matching the filters. */
export async function adminGetAllProfiles<T = Record<string, any>>(
  opts: Omit<AdminProfilesOptions, 'limit' | 'offset'> = {},
): Promise<{ data: T[] | null; error: any }> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await adminGetProfiles<T>({ ...opts, limit: PAGE, offset });
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}
