import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

// Kicked off the moment this module first loads - imported eagerly from
// ScreenCaptureBlockedOverlay.tsx, which App.tsx mounts unconditionally at
// the very top of the tree, before any auth/routing decision happens. Not
// awaited here, so it never blocks rendering. By the time
// enablePrivacyScreen()/disablePrivacyScreen() actually get called (the
// instant auth state changes, in Index.tsx), this dynamic import has
// almost always already resolved - what's left is just the native bridge
// round-trip, not network+parse+bridge stacked on top of it. That gap was
// exactly what let a fast screenshot through unblocked right after login.
const modulePromise = isNative ? import('@capacitor-community/privacy-screen') : null;

// Returns the plugin wrapped in an object, never the plugin itself: a
// Capacitor plugin is a proxy that throws on any method it doesn't implement,
// and resolving a promise with an object makes the engine check for a
// `.then` method on it - so `async () => PrivacyScreen` always rejected with
// '"PrivacyScreen.then()" is not implemented on android' (and on iOS). That
// silently skipped every enable()/disable() below (caught as "best effort"),
// so screenshot protection never actually switched on.
export const getPrivacyScreenPlugin = async () => {
  if (!modulePromise) return null;
  const { PrivacyScreen } = await modulePromise;
  return { plugin: PrivacyScreen };
};

export const enablePrivacyScreen = async (): Promise<void> => {
  try {
    const plugin = (await getPrivacyScreenPlugin())?.plugin;
    await plugin?.enable();
  } catch {
    // Best effort - never let this block app routing/auth flow.
  }
};

export const disablePrivacyScreen = async (): Promise<void> => {
  try {
    const plugin = (await getPrivacyScreenPlugin())?.plugin;
    await plugin?.disable();
  } catch {
    // Best effort.
  }
};
