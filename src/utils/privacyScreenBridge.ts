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

// Tells native code "a logged-in session is active" (Capacitor Preferences key read by MainActivity.onCreate and
// PrivacyScreen.swift at launch) so the next cold start protects the very first frame with no JS involved.
// Only the login lifecycle (enable/disable below) writes it - the temporary Profile/mini-game exemptions
// (useAllowScreenshots) talk to the plugin directly and never touch it.
const setSessionFlag = async (active: boolean): Promise<void> => {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    if (active) await Preferences.set({ key: 'dl_secure_session', value: '1' });
    else await Preferences.remove({ key: 'dl_secure_session' });
  } catch {
    // Best effort.
  }
};

export const enablePrivacyScreen = async (): Promise<void> => {
  if (isNative) void setSessionFlag(true);
  try {
    const plugin = (await getPrivacyScreenPlugin())?.plugin;
    await plugin?.enable();
  } catch {
    // Best effort - never let this block app routing/auth flow.
  }
};

export const disablePrivacyScreen = async (): Promise<void> => {
  if (isNative) void setSessionFlag(false);
  try {
    const plugin = (await getPrivacyScreenPlugin())?.plugin;
    await plugin?.disable();
  } catch {
    // Best effort.
  }
};

// Returning users: switch the protection on at module load - the moment the JS bundle starts - when a saved
// session exists (the native session store is mirrored to localStorage, so this is a synchronous check). Before,
// protection waited for auth to resolve and the first screens rendered unprotected for a moment. If the session turns
// out to be invalid, Index.tsx disables it again as soon as auth settles.
if (isNative) {
  try {
    if (window.localStorage?.getItem('supabase.auth.token')) void enablePrivacyScreen();
  } catch {
    // storage unavailable - Index.tsx enables it once auth resolves
  }
}
