/**
 * Tiny "the first screen's content is ready" signal.
 *
 * Discover marks it once its first feed load has finished; the sign-up ->
 * terms -> app hand-off (src/pages/Index.tsx) keeps its branded
 * "Getting Discover ready" screen up until then, so users never see the app
 * shell with an empty content area while the first tab loads.
 */
let ready = false;
const listeners = new Set<() => void>();

export const markAppContentReady = (): void => {
  if (ready) return;
  ready = true;
  listeners.forEach((cb) => cb());
  listeners.clear();
};

export const resetAppContentReady = (): void => {
  ready = false;
};

/** Calls `cb` once content is ready (immediately if it already is). Returns an unsubscribe. */
export const onAppContentReady = (cb: () => void): (() => void) => {
  if (ready) {
    cb();
    return () => undefined;
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
