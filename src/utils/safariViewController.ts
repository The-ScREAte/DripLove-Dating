// Minimal Safari View Controller helpers — intentionally small and safe to import on web
// Provides cleanupSafariViewController used by AuthForm and an openInAppBrowser helper
// that appleNativeAuth uses to open the Supabase redirect URL.

export async function openInAppBrowser(url: string) {
  try {
    const browserMod = await import('@capacitor/browser').catch(() => null);
    const Browser = browserMod?.Browser;
    if (Browser && typeof Browser.open === 'function') {
      try {
        localStorage.setItem('driplove:inapp_browser_open', '1');
      } catch {
        // ignore storage failures
      }
      await Browser.open({ url });
      return true;
    }
    if (typeof window !== 'undefined') {
      window.location.href = url;
      return true;
    }
  } catch (err) {
    console.error('openInAppBrowser error:', err);
  }
  return false;
}

export function cleanupSafariViewController() {
  try {
    // Try to call removeAllListeners if the Browser plugin exposes it (iOS native cleanup hooks)
    // We dynamically import to avoid bundling native-only code into the web build.
    import('@capacitor/browser')
      .then((m: any) => {
        const Browser = m?.Browser;
        if (Browser && typeof Browser.removeAllListeners === 'function') {
          try { Browser.removeAllListeners(); } catch (e) { /* ignore */ }
        }
      })
      .catch(() => {
        // ignore
      });
  } catch (err) {
    console.error('cleanupSafariViewController error:', err);
  }
}

export default {
  openInAppBrowser,
  cleanupSafariViewController,
};
