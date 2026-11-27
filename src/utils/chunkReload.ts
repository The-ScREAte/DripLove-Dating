/**
 * A lazy chunk that 404s means a new version was deployed while this copy of the app stayed open.
 * Reloading picks up the new index.html + chunks. Done at most once per cooldown window so a chunk that
 * is genuinely unreachable (offline) can never cause a reload loop.
 */
export const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i;

const KEY = 'dl_chunk_reload_at';
const COOLDOWN_MS = 5 * 60 * 1000;

export const shouldReloadForChunk = (lastAt: number | null, now: number, cooldownMs: number = COOLDOWN_MS): boolean =>
  lastAt === null || !Number.isFinite(lastAt) || now - lastAt > cooldownMs || now < lastAt;

/** Reloads the page unless it already did within the cooldown. Returns true when a reload was started. */
export const reloadForStaleChunk = (): boolean => {
  let last: number | null = null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    last = raw === null ? null : Number(raw);
  } catch {
    last = null;
  }
  const now = Date.now();
  if (!shouldReloadForChunk(last, now)) return false;
  try {
    window.sessionStorage.setItem(KEY, String(now));
  } catch {
    // storage blocked: still reload once - the page itself starts fresh anyway
  }
  window.location.reload();
  return true;
};
