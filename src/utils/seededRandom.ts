// Deterministic pseudo-randomness shared by the card system (no Math.random, so the same
// profile always yields the same order within a session / day, and re-renders never reshuffle).

/** mulberry32 PRNG. */
export const mulberry32 = (a: number) => () => {
  let t = a += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

/** FNV-1a string -> uint32 seed. */
export const seedFromString = (s: string | number | undefined | null): number => {
  const str = s == null ? '' : String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Fisher-Yates with a supplied RNG (returns a copy). */
export const seededShuffle = <T,>(arr: readonly T[], rand: () => number): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Local calendar day key ("2026-11-26") - the card order for photo-less profiles is stable for a day. */
export const dayKey = (now: number = Date.now()): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
