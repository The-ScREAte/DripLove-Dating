/**
 * Helpers for server-side purchase validation.
 *
 * A purchase that fails validation because of a network blip / timeout / 5xx is
 * NOT a bad purchase: the user was charged and must still get premium. These
 * helpers separate "try again" failures from definitive ones so callers retry
 * briefly, and never finish (acknowledge) a transaction the server has not yet
 * confirmed - the store then redelivers it on the next launch until it succeeds.
 */

interface InvokeLikeError {
  name?: unknown;
  message?: unknown;
  context?: { status?: unknown } | null;
}

/** True when retrying the same request later could succeed (network, timeout, 408/429/5xx). */
export function isTransientInvokeError(err: unknown): boolean {
  if (!err) return false;
  const e = err as InvokeLikeError;
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';

  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') return true;

  if (name === 'FunctionsHttpError') {
    const status = Number(e.context?.status);
    if (Number.isFinite(status)) return status >= 500 || status === 408 || status === 429;
    return false;
  }

  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed')
  );
}

/** Pure delay schedule so it can be unit-tested. Default: 2 retries after 1.5s and 5s. */
export const DEFAULT_RETRY_DELAYS_MS = [1500, 5000];

/**
 * Runs `fn`; while its result carries a transient `error` (or it throws a
 * transient error) retries after each delay. Returns the last result.
 */
export async function withTransientRetry<T extends { error?: unknown }>(
  fn: () => Promise<T>,
  delaysMs: number[] = DEFAULT_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await fn();
      if (!result.error || !isTransientInvokeError(result.error) || attempt >= delaysMs.length) {
        return result;
      }
    } catch (err) {
      if (!isTransientInvokeError(err) || attempt >= delaysMs.length) throw err;
    }
    await sleep(delaysMs[attempt]);
    attempt += 1;
  }
}
