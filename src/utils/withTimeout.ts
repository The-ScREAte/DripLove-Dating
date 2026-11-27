/**
 * Rejects with `Error("Timeout: <label>")` if `promise` hasn't settled within
 * `ms`. The timer is always cleared once the promise settles, so nothing is
 * left running in the background.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}
