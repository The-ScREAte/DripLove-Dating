import { supabase } from '@/integrations/supabase/client';
import { applyCircleCountFilters, type CategoryFilter } from '@/utils/circleCountQuery';

import { pickTeaserPhotos, type TeaserMember, type TeaserPhotoRow } from '@/utils/circleTeaserPick';
export { pickTeaserPhotos, isTeaserPhotoSafe } from '@/utils/circleTeaserPick';
export type { TeaserMember, TeaserPhotoRow } from '@/utils/circleTeaserPick';

/** hash used for the deterministic per-day window */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const cache = new Map<string, { at: number; photos: Record<string, string[]> }>();
const TTL_MS = 30 * 60 * 1000;
export const clearCircleTeaserCache = (): void => cache.clear();
const PER_CIRCLE_SAMPLE = 20;

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * One photo set per locked circle. ~one light member query per circle (in parallel) + ONE batched
 * photo query for all of them; cached for the session. Returns {} on any problem.
 */
export const fetchCircleTeaserPhotos = async (
  viewerId: string,
  defs: { key: string; filter?: CategoryFilter }[],
  totals: Record<string, number | null>,
  excluded: Set<string>
): Promise<Record<string, string[]>> => {
  const hit = cache.get(viewerId);
  if (hit && Date.now() - hit.at < TTL_MS && defs.every((d) => d.key in hit.photos)) return hit.photos;
  try {
    const day = today();
    const perCircle = await Promise.all(
      defs.map(async (d) => {
        // Active members are few (most accounts are archived), so a window sized from the TOTAL
        // (which includes archived) usually lands past the end and comes back empty. Take the
        // active members from the start, then top up from a per-day window of archived members.
        const base = () => supabase.from('profiles').select('id, is_verified');
        const active = await applyCircleCountFilters(base(), { excluded, filter: d.filter, activeOnly: true }).range(0, PER_CIRCLE_SAMPLE - 1);
        let data = (active.data || []) as TeaserMember[];
        if (data.length < PER_CIRCLE_SAMPLE) {
          const total = totals[d.key] ?? 0;
          const span = Math.max(1, Math.min(total, 400) - PER_CIRCLE_SAMPLE + 1);
          const offset = total > PER_CIRCLE_SAMPLE ? hash(`${d.key}:${day}`) % span : 0;
          const more = await applyCircleCountFilters(base(), { excluded, filter: d.filter }).eq('is_archived', true).range(offset, offset + PER_CIRCLE_SAMPLE - 1);
          data = [...data, ...((more.data || []) as TeaserMember[])];
          if (data.length === (active.data || []).length && offset > 0) {
            const retry = await applyCircleCountFilters(base(), { excluded, filter: d.filter }).eq('is_archived', true).range(0, PER_CIRCLE_SAMPLE - 1);
            data = [...data, ...((retry.data || []) as TeaserMember[])];
          }
        }
        return { key: d.key, members: data };
      })
    );
    const ids = Array.from(new Set(perCircle.flatMap((c) => c.members.map((m) => m.id))));
    if (ids.length === 0) return {};
    const { data: photoRows } = await supabase
      .from('user_images')
      .select('user_id, image_url, image_order, is_approved, moderation_status, flagged_content')
      .in('user_id', ids)
      .eq('is_approved', true)
      .neq('image_order', -1);
    const photos: Record<string, string[]> = {};
    for (const c of perCircle) {
      photos[c.key] = pickTeaserPhotos(c.members, (photoRows || []) as TeaserPhotoRow[], { max: 4, seed: `${c.key}:${day}` });
    }
    cache.set(viewerId, { at: Date.now(), photos });
    return photos;
  } catch {
    return {};
  }
};
