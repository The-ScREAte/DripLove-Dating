/**
 * When does the full opening splash (logo + greeting, ~5 s) play? Not on every launch:
 *   - first launch (nothing remembered)             -> yes
 *   - a holiday season (New Year, Christmas, ...)   -> once per calendar day (and again when the season changes)
 *   - an ordinary day                               -> at most once every 3 days
 * Every other cold start gets only the quick logo screen, so the app opens as soon as it is ready. Resuming from the
 * background never counts (the page is not reloaded). The record lives in localStorage, read synchronously so there is
 * no flash; if storage is unavailable we simply show the splash.
 */
import type { SeasonId } from './seasons';

export const SPLASH_STORAGE_KEY = 'dl_splash_last_v1';
export const ORDINARY_DAY_GAP_MS = 3 * 24 * 60 * 60 * 1000;

export interface SplashRecord {
  at: number;
  day: string; // local YYYY-MM-DD
  season: SeasonId;
}

export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function shouldShowSplash(opts: { now: Date; season: SeasonId; last: SplashRecord | null; forced?: boolean }): boolean {
  const { now, season, last, forced } = opts;
  if (forced || !last) return true;
  if (season !== 'default') return last.season !== season || last.day !== localDay(now);
  return now.getTime() - last.at >= ORDINARY_DAY_GAP_MS || now.getTime() < last.at; // clock moved back: show
}

export function readSplashRecord(): SplashRecord | null {
  try {
    const raw = localStorage.getItem(SPLASH_STORAGE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<SplashRecord>;
    if (typeof r.at === 'number' && typeof r.day === 'string' && typeof r.season === 'string') return r as SplashRecord;
  } catch {
    /* unreadable: treat as never shown */
  }
  return null;
}

export function writeSplashRecord(now: Date, season: SeasonId): void {
  try {
    localStorage.setItem(SPLASH_STORAGE_KEY, JSON.stringify({ at: now.getTime(), day: localDay(now), season } satisfies SplashRecord));
  } catch {
    /* private mode / blocked storage: next launch just shows it again */
  }
}
