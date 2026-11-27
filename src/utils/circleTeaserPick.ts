/**
 * Real member photos for the tiny, blurred avatar cluster on LOCKED Circle tiles (an advertisement
 * for Premium). These are real people, so the picker is deliberately conservative:
 *  - only ACTIVE members (the same filters as the counts: active, non-admin, not the viewer, not a
 *    blocked pair),
 *  - only a MODERATED main photo: `is_approved` AND `moderation_status === 'approved'` AND no
 *    flagged content. Pending / rejected / flagged / unmoderated photos are never used,
 *  - verified members first, then a deterministic-per-day shuffle so the same faces are not always
 *    shown,
 *  - only the photo URL leaves this module: no ids, no names, no alt text.
 * Any failure means "no photos": the UI falls back to silhouettes and never shows an error.
 */

export interface TeaserPhotoRow {
  user_id: string;
  image_url: string | null;
  image_order: number | null;
  is_approved: boolean | null;
  moderation_status: string | null;
  flagged_content: string[] | null;
}

export interface TeaserMember {
  id: string;
  is_verified?: boolean | null;
}

/** Is this one photo safe to show (moderated, approved, unflagged, real URL)? */
export const isTeaserPhotoSafe = (row: TeaserPhotoRow): boolean =>
  row.is_approved === true &&
  row.moderation_status === 'approved' &&
  (row.flagged_content == null || row.flagged_content.length === 0) &&
  typeof row.image_url === 'string' &&
  row.image_url.trim().length > 0 &&
  typeof row.image_order === 'number' &&
  row.image_order >= 0;

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/**
 * Picks up to `max` main-photo URLs. A member's MAIN photo is their lowest-order safe photo; if
 * that member has no safe photo at all they are skipped (we never fall through to a worse photo of
 * someone whose main photo failed moderation). Deduplicates members and URLs.
 */
export const pickTeaserPhotos = (
  members: TeaserMember[],
  photos: TeaserPhotoRow[],
  opts: { max?: number; seed: string }
): string[] => {
  const max = opts.max ?? 3;
  // The member's main photo = their lowest image_order among ALL approved-or-not rows is what
  // other surfaces call "main"; if THAT one is not safe we skip the member entirely.
  const byUser = new Map<string, TeaserPhotoRow[]>();
  for (const p of photos) {
    if (typeof p.image_order === 'number' && p.image_order >= 0) {
      (byUser.get(p.user_id) ?? byUser.set(p.user_id, []).get(p.user_id)!).push(p);
    }
  }
  const candidates: { id: string; verified: boolean; url: string }[] = [];
  const seenMembers = new Set<string>();
  const seenUrls = new Set<string>();
  for (const m of members) {
    if (seenMembers.has(m.id)) continue;
    const rows = (byUser.get(m.id) ?? []).sort((a, b) => (a.image_order ?? 0) - (b.image_order ?? 0));
    const main = rows[0];
    if (!main || !isTeaserPhotoSafe(main)) continue;
    const url = main.image_url as string;
    if (seenUrls.has(url)) continue;
    seenMembers.add(m.id);
    seenUrls.add(url);
    candidates.push({ id: m.id, verified: m.is_verified === true, url });
  }
  candidates.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return hash(`${opts.seed}:${a.id}`) - hash(`${opts.seed}:${b.id}`);
  });
  return candidates.slice(0, max).map((c) => c.url);
};

