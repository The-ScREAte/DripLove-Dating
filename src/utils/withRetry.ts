/**
 * Retries a transient async failure (network blip, cold start, brief 5xx)
 * a few times with exponential backoff before giving up for real. Used
 * around photo storage uploads and their DB row inserts - "no room for
 * failure" for a photo the user has already picked means a blip shouldn't
 * be the difference between it landing on their profile/in the admin queue
 * versus silently vanishing.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number }
): Promise<T> {
  const retries = options?.retries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 600;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}
