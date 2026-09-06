export type GameType = 'test-your-toast' | 'shoot-your-shot' | 'red-flag-green-flag';

export type LocalGameResult = {
  gameType: GameType;
  level: number;
  percentage: number; // 0-100
  score: number;
  total: number;
  timeTakenSeconds?: number;
  playedAt: string; // ISO
};

type LocalGameProgress = {
  gameType: GameType;
  level: number;
  state: unknown;
  savedAt: string; // ISO
};

const RESULTS_KEY = 'driplove:games:results:v1';
const PROGRESS_KEY = 'driplove:games:progress:v1';
const LEVEL_BEST_KEY = 'driplove:games:best-by-level:v1';

const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const safeGetLocalStorage = (): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

// setItem can throw synchronously (QuotaExceededError, private-browsing
// storage caps on some mobile browsers) even when reads work fine. All the
// call sites below sit inside a game's core loop, and this whole feature
// renders under one app-wide ErrorBoundary - an uncaught throw here doesn't
// just skip saving a score, it crashes the entire app to the "Something went
// wrong" screen mid-play. A failed save is fine to silently drop; a crashed
// app is not.
const safeSetItem = (storage: Storage, key: string, value: string): void => {
  try {
    storage.setItem(key, value);
  } catch {
    // best-effort persistence only - never let a storage failure take down the app
  }
};

type ResultsStore = Partial<Record<GameType, LocalGameResult[]>>;
type ProgressStore = Partial<Record<GameType, LocalGameProgress>>;
type LevelBestStore = Partial<Record<GameType, Record<number, LocalGameResult>>>;

export const getBestResults = (gameType: GameType): LocalGameResult[] => {
  const storage = safeGetLocalStorage();
  if (!storage) return [];

  const store = safeParse<ResultsStore>(storage.getItem(RESULTS_KEY)) ?? {};
  return Array.isArray(store[gameType]) ? (store[gameType] as LocalGameResult[]) : [];
};

export const addResult = (result: LocalGameResult): LocalGameResult[] => {
  const storage = safeGetLocalStorage();
  if (!storage) return [];

  const store = safeParse<ResultsStore>(storage.getItem(RESULTS_KEY)) ?? {};
  const existing = Array.isArray(store[result.gameType]) ? (store[result.gameType] as LocalGameResult[]) : [];

  const merged = [result, ...existing]
    .filter(r => r && typeof r.percentage === 'number')
    .sort((a, b) => {
      // higher percentage first
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      // then higher raw score
      if (b.score !== a.score) return b.score - a.score;
      // then faster time if available
      const at = a.timeTakenSeconds ?? Number.POSITIVE_INFINITY;
      const bt = b.timeTakenSeconds ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      // then most recent
      return String(b.playedAt).localeCompare(String(a.playedAt));
    })
    .slice(0, 3);

  store[result.gameType] = merged;
  safeSetItem(storage, RESULTS_KEY, JSON.stringify(store));
  return merged;
};

const isBetterResult = (incoming: LocalGameResult, existing: LocalGameResult | undefined) => {
  if (!existing) return true;
  if (incoming.percentage !== existing.percentage) return incoming.percentage > existing.percentage;
  if (incoming.score !== existing.score) return incoming.score > existing.score;
  const at = incoming.timeTakenSeconds ?? Number.POSITIVE_INFINITY;
  const bt = existing.timeTakenSeconds ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt;
  return String(incoming.playedAt).localeCompare(String(existing.playedAt)) > 0;
};

export const updateBestForLevel = (result: LocalGameResult): Record<number, LocalGameResult> => {
  const storage = safeGetLocalStorage();
  if (!storage) return {};

  const store = safeParse<LevelBestStore>(storage.getItem(LEVEL_BEST_KEY)) ?? {};
  const perGame = (store[result.gameType] as Record<number, LocalGameResult>) ?? {};
  const current = perGame[result.level];

  if (isBetterResult(result, current)) {
    perGame[result.level] = result;
    store[result.gameType] = perGame;
    safeSetItem(storage, LEVEL_BEST_KEY, JSON.stringify(store));
  }

  return store[result.gameType] ?? perGame;
};

export const getLevelBests = (gameType: GameType): Record<number, LocalGameResult> => {
  const storage = safeGetLocalStorage();
  if (!storage) return {};

  const store = safeParse<LevelBestStore>(storage.getItem(LEVEL_BEST_KEY)) ?? {};
  const perGame = store[gameType];
  return (perGame && typeof perGame === 'object') ? perGame : {};
};

export const clearLevelBests = (gameType: GameType) => {
  const storage = safeGetLocalStorage();
  if (!storage) return;

  const store = safeParse<LevelBestStore>(storage.getItem(LEVEL_BEST_KEY)) ?? {};
  delete store[gameType];
  safeSetItem(storage, LEVEL_BEST_KEY, JSON.stringify(store));
};

export const clearResults = (gameType: GameType) => {
  const storage = safeGetLocalStorage();
  if (!storage) return;

  const store = safeParse<ResultsStore>(storage.getItem(RESULTS_KEY)) ?? {};
  delete store[gameType];
  safeSetItem(storage, RESULTS_KEY, JSON.stringify(store));
};

export const saveProgress = (gameType: GameType, level: number, state: unknown) => {
  const storage = safeGetLocalStorage();
  if (!storage) return;

  const store = safeParse<ProgressStore>(storage.getItem(PROGRESS_KEY)) ?? {};
  store[gameType] = {
    gameType,
    level,
    state,
    savedAt: new Date().toISOString(),
  };
  safeSetItem(storage, PROGRESS_KEY, JSON.stringify(store));
};

export const loadProgress = (gameType: GameType): { level: number; state: unknown } | null => {
  const storage = safeGetLocalStorage();
  if (!storage) return null;

  const store = safeParse<ProgressStore>(storage.getItem(PROGRESS_KEY)) ?? {};
  const entry = store[gameType];
  if (!entry || typeof entry.level !== 'number') return null;
  return { level: entry.level, state: entry.state };
};

export const clearProgress = (gameType: GameType) => {
  const storage = safeGetLocalStorage();
  if (!storage) return;

  const store = safeParse<ProgressStore>(storage.getItem(PROGRESS_KEY)) ?? {};
  delete store[gameType];
  safeSetItem(storage, PROGRESS_KEY, JSON.stringify(store));
};
