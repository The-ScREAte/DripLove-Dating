import { supabase } from '@/integrations/supabase/client';

export { applyCircleCountFilters } from '@/utils/circleCountFilters';
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
