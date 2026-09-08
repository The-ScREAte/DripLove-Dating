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

export const getPrivacyScreenPlugin = async () => {
  if (!modulePromise) return null;
  const { PrivacyScreen } = await modulePromise;
  return PrivacyScreen;
};

export const enablePrivacyScreen = async (): Promise<void> => {
  try {
    const plugin = await getPrivacyScreenPlugin();
    await plugin?.enable();
  } catch {
    // Best effort - never let this block app routing/auth flow.
  }
};

export const disablePrivacyScreen = async (): Promise<void> => {
  try {
    const plugin = await getPrivacyScreenPlugin();
    await plugin?.disable();
  } catch {
    // Best effort.
  }
};
