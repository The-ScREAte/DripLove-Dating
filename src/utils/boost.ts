// Boost - pure helpers (no React, no network) so they can be unit tested.

/** Free boost length (backend: one per day). */
export const FREE_BOOST_MINUTES = 15;
/** Premium boost length (back to back, one at a time). */
export const PREMIUM_BOOST_MINUTES = 20;

/** "14:59" under an hour, "1:02:03" above; never negative. */
export function formatBoostClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Short "time until" for the next free boost: "5h", "45m", "1m" (rounded up so it never reads "0m"). */
export function formatBoostWait(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '1m';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${Math.max(1, hours)}h`;
}

/** 0..1 of the boost already used (drives the ring on the button). */
export function boostProgress(endsAt: number, durationMinutes: number, now: number = Date.now()): number {
  const total = Math.max(1, durationMinutes) * 60_000;
  const left = Math.max(0, endsAt - now);
  return Math.min(1, Math.max(0, 1 - left / total));
}

export const toMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

/* ------------------------------ deck insertion ------------------------------ */

export interface DeckInsertOptions<T> {
  /** Ids that must never be (re)inserted: already swiped / locally excluded / waiting hellos / me. */
  excludedIds?: Iterable<string>;
  /** Items that are not profiles (ads): never deduped against and never moved. */
  isAd?: (item: T) => boolean;
  /** Where the first boosted card lands, counted from the current card: 1 = right after it, 2 = one card later. */
  offset?: number;
  /** At most this many boosted cards per call. */
  maxInsert?: number;
}

export interface DeckInsertResult<T> {
  deck: T[];
  /** Ids that were inserted or moved forward. */
  inserted: string[];
}

/**
 * Puts boosted profiles into an already loaded deck, `offset` cards after the current one.
 *
 * - The card being swiped (deck[currentIndex]) and everything before it never move or change.
 * - A boosted profile that already waits at or before the insertion point stays where it is (it is about to be seen
 *   anyway); one that waits further back is moved up - so there are never duplicates.
 * - Excluded ids and the current card are skipped; incoming duplicates are collapsed.
 * - No current card (empty / finished deck) -> nothing changes; the normal refill owns that state.
 * Returns the SAME array when nothing changed, so a React state update can bail out.
 */
export function insertBoostedIntoDeck<T extends { id: string }>(
  deck: T[],
  currentIndex: number,
  incoming: T[],
  opts: DeckInsertOptions<T> = {}
): DeckInsertResult<T> {
  const isAd = opts.isAd ?? (() => false);
  const offset = Math.max(1, Math.floor(opts.offset ?? 2));
  const maxInsert = Math.max(0, Math.floor(opts.maxInsert ?? 3));
  if (!Array.isArray(deck) || currentIndex < 0 || currentIndex >= deck.length || !deck[currentIndex]) return { deck, inserted: [] };
  if (!incoming.length || maxInsert === 0) return { deck, inserted: [] };

  const excluded = new Set<string>(opts.excludedIds ?? []);
  const current = deck[currentIndex];
  if (!isAd(current)) excluded.add(current.id);

  // Insert position in the ORIGINAL deck (clamped: a short deck gets them right after the current card).
  const insertAt = Math.min(currentIndex + offset, deck.length);

  // Where each profile already sits.
  const position = new Map<string, number>();
  deck.forEach((item, i) => {
    if (!isAd(item) && !position.has(item.id)) position.set(item.id, i);
  });

  const take: T[] = [];
  const seen = new Set<string>();
  const moveFrom = new Set<number>();
  for (const item of incoming) {
    if (take.length >= maxInsert) break;
    if (!item || !item.id || isAd(item)) continue;
    if (seen.has(item.id) || excluded.has(item.id)) continue;
    seen.add(item.id);
    const at = position.get(item.id);
    if (at !== undefined) {
      if (at < insertAt) continue; // already shown / current / about to be seen
      moveFrom.add(at);
      take.push(deck[at]); // keep the deck's own copy (it may already carry images, captions...)
      continue;
    }
    take.push(item);
  }
  if (!take.length) return { deck, inserted: [] };

  const head = deck.slice(0, insertAt);
  const tail = deck.slice(insertAt).filter((_, i) => !moveFrom.has(insertAt + i));
  return { deck: [...head, ...take, ...tail], inserted: take.map((t) => t.id) };
}

/** Wins older than this no longer get a "Boost got you this" label. */
export const BOOST_WIN_LABEL_DAYS = 7;
