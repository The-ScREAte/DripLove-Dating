import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';

/**
 * Screenshot/screen-recording protection is ON app-wide by default (enabled
 * once at startup - see MainApp.tsx). Call this hook from a screen that
 * should be exempt (Profile, the mini-games) with `active` true while that
 * screen is the one on screen. It disables protection for as long as that's
 * true, and puts it back on the instant it isn't - whether that's an
 * unmount (a game page navigated away from) or just `active` flipping to
 * false (Profile staying mounted in the background per MainApp's tab
 * model, only ever hidden via display:none, never unmounted on tab switch).
 *
 * Native-only: there is no browser API to block screenshots at all, so this
 * is a no-op on web. iOS also cannot be selective about WHICH other screens
 * get blocked mid-session the way Android's FLAG_SECURE can - iOS support
 * here is coarser (plugin-level), Android is the platform this is fully
 * effective on.
 */
export const useAllowScreenshots = (active: boolean = true) => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!active) return;

    PrivacyScreen.disable().catch(() => {
      // Ignore - best effort, never block rendering on this
    });

    return () => {
      PrivacyScreen.enable().catch(() => {
        // Ignore
      });
    };
  }, [active]);
};
