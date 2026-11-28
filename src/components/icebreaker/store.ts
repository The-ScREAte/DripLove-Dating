// Where "Break the ice" UI state lives: which person the composer is open for, and the few app-level
// actions the host (mounted once in MainApp) hands us. A button on any card just calls
// openIcebreaker(target); one <IcebreakerHost/> draws the composer sheet. A sent hello is a normal chat.

import { useSyncExternalStore } from 'react';
import type { Starter } from '@/utils/icebreaker';

export interface IcebreakerTarget {
  id: string;
  name: string;
  photoUrl?: string | null;
  starters?: Starter[];
  verified?: boolean;
  /** Opener to put in the composer when it opens (a tapped suggestion). */
  prefill?: string;
}

interface UiState {
  target: IcebreakerTarget | null;
}
let ui: UiState = { target: null };
const listeners = new Set<() => void>();
const set = (next: Partial<UiState>) => {
  ui = { ...ui, ...next };
  listeners.forEach((l) => l());
};

export const openIcebreaker = (target: IcebreakerTarget) => set({ target });
export const closeIcebreaker = () => set({ target: null });

export const useIcebreakerUi = (): UiState =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ui,
    () => ui
  );

/** App-level actions provided by MainApp (open a conversation, open the Premium flow). */
export interface IcebreakerHandlers {
  openChat: (matchId?: string | null) => void;
  openPremium: () => void;
  /** Premium status, only used to show a sensible chances number while the backend is unreachable. */
  isPremium?: boolean;
}
let handlers: IcebreakerHandlers = { openChat: () => undefined, openPremium: () => undefined };
export const setIcebreakerHandlers = (h: IcebreakerHandlers) => {
  handlers = h;
};
export const getIcebreakerHandlers = (): IcebreakerHandlers => handlers;
