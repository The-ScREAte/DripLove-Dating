// Single place that records runtime errors caught by the React error boundaries.
//
// - Always logs to the console (with the component stack, which is what actually
//   tells us WHICH component threw).
// - Keeps a small ring buffer in localStorage so a crash that happened on a user's
//   device can be read back afterwards (Profile → long-press the version text →
//   "Copy error log", or `copy(localStorage.getItem('dl_error_log'))` in a console).
// - Never throws: logging must not be able to cause another crash.

const STORAGE_KEY = 'dl_error_log';
const MAX_ENTRIES = 20;
const MAX_FIELD = 2000;

export interface AppErrorEntry {
  time: string;
  source: string; // e.g. 'app', 'tab:profile', 'popup-host'
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  tab?: string;
  url?: string;
  version?: string;
}

const clip = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === 'string' ? value : String(value);
  return text.length > MAX_FIELD ? `${text.slice(0, MAX_FIELD)}…` : text;
};

const appVersion = (): string | undefined => {
  try {
    const meta = (import.meta as unknown as { env?: Record<string, string> }).env;
    return meta?.VITE_APP_VERSION || undefined;
  } catch {
    return undefined;
  }
};

export const getErrorLog = (): AppErrorEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppErrorEntry[]) : [];
  } catch {
    return [];
  }
};

export const clearErrorLog = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const formatErrorLog = (): string => {
  const entries = getErrorLog();
  if (entries.length === 0) return 'No errors recorded.';
  return entries
    .map(
      (entry) =>
        `[${entry.time}] ${entry.source}${entry.tab ? ` (tab: ${entry.tab})` : ''}\n${entry.name}: ${entry.message}\n${entry.stack ?? ''}\n${entry.componentStack ?? ''}`,
    )
    .join('\n\n----\n\n');
};

export const logAppError = (
  source: string,
  error: unknown,
  info?: { componentStack?: string | null },
  extra?: { tab?: string },
): void => {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    const entry: AppErrorEntry = {
      time: new Date().toISOString(),
      source,
      name: err.name || 'Error',
      message: clip(err.message) ?? '',
      stack: clip(err.stack),
      componentStack: clip(info?.componentStack ?? undefined),
      tab: extra?.tab,
      url: typeof location !== 'undefined' ? clip(location.pathname) : undefined,
      version: appVersion(),
    };

    console.error(`[${source}] Caught error:`, err, info?.componentStack ?? '');

    // Handy for automated checks and for support: the most recent error, in memory.
    (globalThis as unknown as { __DL_LAST_ERROR__?: AppErrorEntry }).__DL_LAST_ERROR__ = entry;

    const next = [...getErrorLog(), entry].slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // logging must never throw
  }
};
