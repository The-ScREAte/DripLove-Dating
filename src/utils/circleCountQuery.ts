import { supabase } from '@/integrations/supabase/client';

export { applyCircleCountFilters, MAX_EXCLUDED_IN_URL } from '@/utils/circleCountFilters';
export type { CategoryFilter } from '@/utils/circleCountFilters';
import { fetchBlockRows } from '@/utils/blockCounterparts';
import type { CategoryFilter } from '@/utils/circleCountFilters';
import { applyCircleCountFilters } from '@/utils/circleCountFilters';

interface TotalsViewer {
  id: string;
}

/** The viewer themself + every blocked pair (either direction). Best effort: a failed lookup just returns the viewer. */
export const fetchViewerExclusions = async (viewerId: string): Promise<Set<string>> => {
  const excluded = new Set<string>([viewerId]);
  try {
    const { data } = await fetchBlockRows(viewerId);
    (data || []).forEach((b) => {
      if (b.blocked_id) excluded.add(b.blocked_id);
      if (b.blocker_id) excluded.add(b.blocker_id);
    });
  } catch {
    // best effort
  }
  return excluded;
};

const totalsCache = new Map<string, { at: number; totals: Record<string, number | null> }>();
export const clearCircleTotalsCache = (): void => totalsCache.clear();
const TOTALS_TTL_MS = 10 * 60 * 1000;

/**
 * ENTIRE-APP size of each given circle: every active-account member in it (archived members
 * included), with NO country, gender, age or distance filter - only the viewer themself, non-active
 * / admin accounts and blocked pairs are left out. This is the number advertised on a locked tile (and on a premium tile before
 * any countries are picked), so it is simply a truthful member count.
 * Head counts only (no rows downloaded), all circles in parallel, cached per viewer for the
 * session. A circle whose count cannot be fetched is `null` (the UI says "Many", never an
 * invented figure).
 */
export const fetchCircleTotals = async (
  viewer: TotalsViewer,
  defs: { key: string; filter?: CategoryFilter }[]
): Promise<Record<string, number | null>> => {
  const wanted = defs.map((d) => d.key);
  const hit = totalsCache.get(viewer.id);
  if (hit && Date.now() - hit.at < TOTALS_TTL_MS && wanted.every((k) => k in hit.totals)) return hit.totals;

  const excluded = await fetchViewerExclusions(viewer.id);

  const entries = await Promise.all(
    defs.map(async (d) => {
      try {
        const res = await applyCircleCountFilters(
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          { excluded, filter: d.filter }
        );
        return [d.key, !res.error && typeof res.count === 'number' ? res.count : null] as const;
      } catch {
        return [d.key, null] as const;
      }
    })
  );
  const totals = Object.fromEntries(entries) as Record<string, number | null>;
  const prev = totalsCache.get(viewer.id);
  const merged = { ...(prev && Date.now() - prev.at < TOTALS_TTL_MS ? prev.totals : {}), ...totals };
  if (Object.values(totals).some((v) => v !== null)) totalsCache.set(viewer.id, { at: Date.now(), totals: merged });
  return totals;
};

export interface CircleCountRpcOptions {
  codes?: string[] | null;
  allowedGenders?: string[] | null;
  dob?: { earliest: string; latest: string } | null;
  excluded?: Set<string>;
  box?: { lat: number; lon: number; degrees: number } | null;
  viewerGender?: string;
  activeOnly?: boolean;
  filter?: CategoryFilter;
}

/**
 * Same count as applyCircleCountFilters(...head) but through the count_circle_profiles RPC, so the (large) exclusion
 * list travels in the POST body instead of the URL. Returns null when the RPC is unavailable or fails, so the caller
 * can fall back to the query-builder path.
 */
export const countCircleProfilesRpc = async (o: CircleCountRpcOptions): Promise<number | null> => {
  try {
    const f = o.filter;
    const { data, error } = await supabase.rpc('count_circle_profiles' as never, {
      p_country_codes: o.codes && o.codes.length > 0 ? o.codes : null,
      p_allowed_genders: o.allowedGenders && o.allowedGenders.length > 0 ? o.allowedGenders : null,
      p_dob_earliest: o.dob?.earliest ?? null,
      p_dob_latest: o.dob?.latest ?? null,
      p_excluded_ids: o.excluded && o.excluded.size > 0 ? Array.from(o.excluded) : null,
      p_box_lat: o.box?.lat ?? null,
      p_box_lon: o.box?.lon ?? null,
      p_box_degrees: o.box?.degrees ?? null,
      p_viewer_gender: o.viewerGender ?? null,
      p_active_only: o.activeOnly ?? false,
      p_relationship_intent: f?.relationshipIntent ?? null,
      p_is_verified: f?.isVerified ?? null,
      p_family_plans: f?.familyPlans ?? null,
      p_interest: f?.interest ?? null,
      p_has_music: f?.hasMusic ?? null,
      p_has_social_media: f?.hasSocialMedia ?? null,
      p_has_pets: f?.hasPets ?? null,
    } as never);
    if (error || typeof data !== 'number') return null;
    return data;
  } catch {
    return null;
  }
};
