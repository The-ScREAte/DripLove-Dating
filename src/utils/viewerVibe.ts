import { useSyncExternalStore } from 'react';

/**
 * The signed-in viewer's interests + favorites (which carry their values / music),
 * published by MainApp once their profile loads, so any profile card can show
 * "You both like ..." without every screen passing the viewer around.
 */
export interface ViewerVibe {
  id: string | null;
  interests: unknown;
  favorites: unknown;
}

const EMPTY: ViewerVibe = { id: null, interests: [], favorites: [] };
let state: ViewerVibe = EMPTY;
const listeners = new Set<() => void>();

export function setViewerVibe(next: { id?: string | null; interests?: unknown; favorites?: unknown } | null): void {
  const value: ViewerVibe = next
    ? { id: next.id ?? null, interests: next.interests ?? [], favorites: next.favorites ?? [] }
    : EMPTY;
  if (value.id === state.id && value.interests === state.interests && value.favorites === state.favorites) return;
  state = value;
  listeners.forEach((l) => l());
}

export const getViewerVibe = (): ViewerVibe => state;

export function useViewerVibe(): ViewerVibe {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getViewerVibe,
    getViewerVibe,
  );
}
