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

/* ------------------------- fair placement for many boosters ------------------------- */
//
// Several people can be boosted at once. Each Discover poll lays them out in MY deck like this
// (offsets are counted from the current card, which itself never changes):
//
//   +1 B   +2 n   +3 B   +4 n   +5 B   +6 n  +7 n  +8 B   +9 n  +10 n  +11 B ...
//   \_______ front: boosted and normal alternate _____/ \___ the rest: every 3rd card ___/
//
// Who gets the three front slots rotates on every poll: least recently fronted first, then the boost that ends soonest
// (it has the least time left), so with 12 boosters everybody is up front within four polls.
//
// Every poll starts from the NATURAL deck: everything a previous poll moved goes back to where it was, everything it
// injected comes out, and then the current boosters are laid out again. So when a boost ends (its end time passes, or
// the server no longer lists it) that person simply isn't laid out again - a profile that was already in my deck goes
// back between the same neighbours it had, one that was only there because of the boost leaves (normal fetching brings
// it back like anyone else). Nobody is ever pushed BEHIND their natural spot: a booster who already waits at or before
// the slot they'd get stays put.

export interface BoostedEntry {
  id: string;
  /** ms epoch; null = unknown (treated as still running). */
  endsAt: number | null;
}

export interface BoostPlacement<T> {
  id: string;
  /** injected = was not in my deck before the boost; moved = was in it, further back. */
  kind: 'injected' | 'moved';
  /** The exact deck object placed. If the deck now holds a different copy (deck rebuilt), the record is stale. */
  item: T;
  endsAt: number | null;
  /** moved only: the closest untouched cards around the natural spot, used to put it back. */
  prevId: string | null;
  nextId: string | null;
  /** moved only: the natural index, so several are put back in their original order. */
  naturalIndex: number;
}

export interface BoostDeckState<T> {
  placements: Record<string, BoostPlacement<T>>;
  /** Round in which each booster last had a front slot (fairness). */
  lastFrontedRound: Record<string, number>;
  /** One round per poll. */
  round: number;
}

export const emptyBoostDeckState = <T>(): BoostDeckState<T> => ({ placements: {}, lastFrontedRound: {}, round: 0 });

export interface BoostLayoutOptions<T> {
  /** Never placed: already swiped / locally excluded / waiting hellos / blocked / me. */
  excludedIds?: Iterable<string>;
  /** Items that are not profiles (ads): they count as positions, are never moved and never anchors. */
  isAd?: (item: T) => boolean;
  /** Front slots, counted from the current card. Default [1, 3, 5]. */
  frontOffsets?: number[];
  /** After the last front slot, one booster every this many cards. Default 3. */
  spillEvery?: number;
  now?: number;
  /** true (a poll) starts a new fairness round; false (a boost just ended) keeps the current front people up front. */
  rotate?: boolean;
}

export interface BoostLayoutResult<T> {
  /** The SAME array when nothing changed, so a React state update can bail out. */
  deck: T[];
  state: BoostDeckState<T>;
  /** Boosters now within the front window (current card .. last front slot). */
  fronted: string[];
  /** Boosters this layout moved or injected. */
  placed: string[];
  /** Boost over: moved back to their natural spot. */
  restored: string[];
  /** Boost over: taken out (they were only in the deck because of the boost). */
  removed: string[];
  /** Earliest end among the placed boosters - lay out again then, to put them back. */
  nextExpiryAt: number | null;
}

/** Fair order: never / least recently fronted first, then soonest ending, then the server's order. */
export function orderBoostersFairly(entries: BoostedEntry[], lastFrontedRound: Record<string, number>, keepFrontRound?: number): BoostedEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (keepFrontRound !== undefined) {
        const af = lastFrontedRound[a.e.id] === keepFrontRound ? 0 : 1;
        const bf = lastFrontedRound[b.e.id] === keepFrontRound ? 0 : 1;
        if (af !== bf) return af - bf;
      }
      const ar = lastFrontedRound[a.e.id] ?? -1;
      const br = lastFrontedRound[b.e.id] ?? -1;
      if (ar !== br) return ar - br;
      const ae = a.e.endsAt ?? Number.POSITIVE_INFINITY;
      const be = b.e.endsAt ?? Number.POSITIVE_INFINITY;
      if (ae !== be) return ae - be;
      return a.i - b.i;
    })
    .map((x) => x.e);
}

/** Offsets (from the current card) for the k-th placed booster: the front slots, then every `spillEvery` cards. */
export function boostSlotOffset(k: number, frontOffsets: number[] = [1, 3, 5], spillEvery = 3): number {
  const front = frontOffsets.length ? frontOffsets : [1];
  if (k < front.length) return front[k];
  return front[front.length - 1] + (k - front.length + 1) * Math.max(1, spillEvery);
}

/**
 * Lays the live boosters out in the deck (see the comment above). Pure: same input -> same output, so it is safe
 * inside a React state updater (which may run twice).
 *
 * @param boosted  live boosters (any order; ended ones and duplicates are ignored)
 * @param profileFor  a deck-ready item for a booster who is not in the deck yet (undefined = can't place them now)
 */
export function layoutBoostedDeck<T extends { id: string }>(
  deck: T[],
  currentIndex: number,
  boosted: BoostedEntry[],
  profileFor: (id: string) => T | undefined,
  state: BoostDeckState<T>,
  opts: BoostLayoutOptions<T> = {}
): BoostLayoutResult<T> {
  const isAd = opts.isAd ?? (() => false);
  const now = opts.now ?? Date.now();
  const rotate = opts.rotate !== false;
  const frontOffsets = (opts.frontOffsets?.length ? opts.frontOffsets : [1, 3, 5]).map((o) => Math.max(1, Math.floor(o)));
  const frontWindow = Math.max(...frontOffsets);
  const spillEvery = Math.max(1, Math.floor(opts.spillEvery ?? 3));
  const noop: BoostLayoutResult<T> = { deck, state, fronted: [], placed: [], restored: [], removed: [], nextExpiryAt: null };
  // No current card (empty / finished deck): the normal refill owns that state.
  if (!Array.isArray(deck) || currentIndex < 0 || currentIndex >= deck.length || !deck[currentIndex]) return noop;
  const pinEnd = currentIndex; // deck[0..pinEnd] never moves

  const excluded = new Set<string>(opts.excludedIds ?? []);
  const active = new Map<string, BoostedEntry>();
  for (const e of boosted) {
    if (!e || !e.id || active.has(e.id) || excluded.has(e.id)) continue;
    if (e.endsAt !== null && e.endsAt <= now) continue;
    active.set(e.id, e);
  }

  const indexIn = (arr: T[]) => {
    const m = new Map<string, number>();
    arr.forEach((it, i) => {
      if (it && !isAd(it) && !m.has(it.id)) m.set(it.id, i);
    });
    return m;
  };

  /* ---- 1. back to the natural deck ---- */
  const pos = indexIn(deck);
  const pinned: Record<string, BoostPlacement<T>> = {};
  const undo: BoostPlacement<T>[] = [];
  for (const p of Object.values(state.placements)) {
    const i = pos.get(p.id);
    if (i === undefined || deck[i] !== p.item) continue; // swiped, or the deck was rebuilt: nothing to undo
    if (i <= pinEnd) pinned[p.id] = p; // on screen right now: leave it, it's being seen
    else undo.push(p);
  }
  let natural = deck;
  if (undo.length) {
    const undoIdx = new Set(undo.map((p) => pos.get(p.id) as number));
    natural = deck.filter((_, i) => !undoIdx.has(i));
    const moved = undo.filter((p) => p.kind === 'moved').sort((a, b) => a.naturalIndex - b.naturalIndex);
    const back = new Set<string>();
    for (const p of moved) {
      const at = indexIn(natural);
      const nextAt = p.nextId ? at.get(p.nextId) : undefined;
      const prevAt = p.prevId ? at.get(p.prevId) : undefined;
      let insertAt: number;
      let afterEarlier = true;
      if (nextAt !== undefined && nextAt > pinEnd) {
        insertAt = nextAt; // right before the card that followed it
        afterEarlier = false;
      } else if (prevAt !== undefined && prevAt >= pinEnd) insertAt = prevAt + 1; // right after the card before it
      else if (!p.nextId) insertAt = natural.length; // it was last: still last
      else insertAt = pinEnd + 1; // its natural spot has already come up: it's due now
      // Several going back to the same spot keep their natural order (sorted above): later ones after earlier ones.
      if (afterEarlier) {
        while (insertAt < natural.length && !isAd(natural[insertAt]) && back.has(natural[insertAt].id)) insertAt++;
      }
      natural = [...natural.slice(0, insertAt), p.item, ...natural.slice(insertAt)];
      back.add(p.id);
    }
  }

  /* ---- 2. lay the live boosters out again ---- */
  const nat = indexIn(natural);
  const ordered = orderBoostersFairly([...active.values()], state.lastFrontedRound, rotate ? undefined : state.round);
  type Place = { id: string; item: T; kind: 'injected' | 'moved'; target: number; entry: BoostedEntry };
  const places: Place[] = [];
  for (const e of ordered) {
    const i = nat.get(e.id);
    if (i !== undefined && i <= pinEnd) {
      continue; // it's the current card
    }
    const target = boostSlotOffset(places.length, frontOffsets, spillEvery);
    if (i !== undefined) {
      if (i - pinEnd <= target) {
        continue; // already at or before its slot: never push anyone back
      }
      places.push({ id: e.id, item: natural[i], kind: 'moved', target, entry: e });
      continue;
    }
    const prevPlacement = state.placements[e.id];
    // Re-use the copy injected last time (same object: no re-render, keeps anything attached to it).
    const item = (prevPlacement?.kind === 'injected' ? prevPlacement.item : undefined) ?? profileFor(e.id);
    if (!item || item.id !== e.id) continue;
    places.push({ id: e.id, item, kind: 'injected', target, entry: e });
  }

  const movedIds = new Set(places.filter((p) => p.kind === 'moved').map((p) => p.id));
  const placements: Record<string, BoostPlacement<T>> = { ...pinned };
  for (const pl of places) {
    if (pl.kind === 'injected') {
      placements[pl.id] = { id: pl.id, kind: 'injected', item: pl.item, endsAt: pl.entry.endsAt, prevId: null, nextId: null, naturalIndex: -1 };
      continue;
    }
    const i = nat.get(pl.id) as number;
    let prevId: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const it = natural[j];
      if (it && !isAd(it) && !movedIds.has(it.id)) {
        prevId = it.id;
        break;
      }
    }
    let nextId: string | null = null;
    for (let j = i + 1; j < natural.length; j++) {
      const it = natural[j];
      if (it && !isAd(it) && !movedIds.has(it.id)) {
        nextId = it.id;
        break;
      }
    }
    placements[pl.id] = { id: pl.id, kind: 'moved', item: pl.item, endsAt: pl.entry.endsAt, prevId, nextId, naturalIndex: i };
  }

  const head = natural.slice(0, pinEnd + 1);
  const normals = natural.slice(pinEnd + 1).filter((it) => isAd(it) || !movedIds.has(it.id));
  const out: T[] = [...head];
  let pi = 0;
  let ni = 0;
  while (pi < places.length || ni < normals.length) {
    const offset = out.length - pinEnd;
    if (pi < places.length && (places[pi].target <= offset || ni >= normals.length)) out.push(places[pi++].item);
    else out.push(normals[ni++]);
  }

  /* ---- 3. fairness bookkeeping ---- */
  const round = rotate ? state.round + 1 : state.round;
  const lastFrontedRound: Record<string, number> = {};
  for (const id of active.keys()) {
    if (state.lastFrontedRound[id] !== undefined) lastFrontedRound[id] = state.lastFrontedRound[id];
  }
  const fronted: string[] = [];
  for (let i = pinEnd; i < out.length && i - pinEnd <= frontWindow; i++) {
    const it = out[i];
    if (it && !isAd(it) && active.has(it.id)) {
      fronted.push(it.id);
      lastFrontedRound[it.id] = round;
    }
  }

  const restored = undo.filter((p) => p.kind === 'moved' && !active.has(p.id)).map((p) => p.id);
  const removed = undo.filter((p) => p.kind === 'injected' && !active.has(p.id)).map((p) => p.id);
  let nextExpiryAt: number | null = null;
  for (const p of Object.values(placements)) {
    if (p.endsAt !== null && p.endsAt > now && (nextExpiryAt === null || p.endsAt < nextExpiryAt)) nextExpiryAt = p.endsAt;
  }

  const same = out.length === deck.length && out.every((it, i) => it === deck[i]);
  return {
    deck: same ? deck : out,
    state: { placements, lastFrontedRound, round },
    fronted,
    placed: places.map((p) => p.id),
    restored,
    removed,
    nextExpiryAt,
  };
}

/** Wins older than this no longer get a "Boost got you this" label. */
export const BOOST_WIN_LABEL_DAYS = 7;
