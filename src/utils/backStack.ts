import { useEffect, useRef } from 'react';

/**
 * Android hardware-back handling for overlays (dialogs, sheets, full-screen
 * profile views). Each open overlay registers a handler; back closes the
 * topmost one. With nothing open, back does what Capacitor's own default does
 * (go back in history, otherwise leave the app) - so installing this listener
 * never changes behaviour for screens that don't register anything.
 */
type BackHandler = () => void;

const stack: BackHandler[] = [];
let installStarted = false;

const installNativeListener = async () => {
  if (installStarted) return;
  installStarted = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', ({ canGoBack }) => {
      const top = stack[stack.length - 1];
      if (top) {
        top();
      } else if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch {
    // Not running under Capacitor (plain web) - nothing to hook.
    installStarted = false;
  }
};

/** Register a handler for the back button; returns the unregister function. */
export const pushBackHandler = (handler: BackHandler): (() => void) => {
  stack.push(handler);
  void installNativeListener();
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index !== -1) stack.splice(index, 1);
  };
};

/** While `active`, Android back (and Escape on the web) calls `onClose`. */
export const useBackClose = (
  active: boolean,
  onClose: () => void,
  options: { escape?: boolean } = {}
): void => {
  const { escape = true } = options;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return undefined;
    const unregister = pushBackHandler(() => closeRef.current());
    const onKeyDown = (event: KeyboardEvent) => {
      // Only the topmost overlay reacts; stopPropagation keeps a parent from also closing.
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };
    if (escape) document.addEventListener('keydown', onKeyDown);
    return () => {
      unregister();
      if (escape) document.removeEventListener('keydown', onKeyDown);
    };
  }, [active, escape]);
};
