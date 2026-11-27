import { useEffect, useSyncExternalStore } from 'react';
import { popupStore } from './instance';
import type { BusyReason, PopupEnv } from './types';

export const usePopupSnapshot = () => useSyncExternalStore(popupStore.subscribe, popupStore.getSnapshot, popupStore.getSnapshot);

/** True while popup `id` is the one on screen (use for `inline` popups the component draws itself). */
export const useIsPopupActive = (id: string): boolean => usePopupSnapshot().active?.id === id;

/** While `busy` is true, calm popups (engagement/passive) won't appear. */
export const usePopupBusy = (reason: BusyReason, busy: boolean): void => {
  useEffect(() => {
    if (!busy) return undefined;
    popupStore.setBusy(reason, true);
    return () => popupStore.setBusy(reason, false);
  }, [reason, busy]);
};

/** MainApp: keep the coordinator's picture of the app current. */
export const usePopupEnvSync = (userId: string | undefined, env: Partial<PopupEnv>): void => {
  useEffect(() => {
    popupStore.setUser(userId ?? null);
  }, [userId]);
  const { authed, onboardingDone, screen, isPremium, dataReady, appActive } = env;
  useEffect(() => {
    popupStore.setEnv({ authed, onboardingDone, screen, isPremium, dataReady, appActive });
  }, [authed, onboardingDone, screen, isPremium, dataReady, appActive]);
};
