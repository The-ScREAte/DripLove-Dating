
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./motion.css";
import "./design-tokens.css";
import "./i18n/config"; // Initialize i18n
import { supabase } from "./integrations/supabase/client";
import { clearAllUserCaches, noteSignedInUser } from "./utils/clearUserCaches";
import { reloadForStaleChunk } from "./utils/chunkReload";
import HoppingLogo from "./components/HoppingLogo";
import SeasonalSplash from "./components/SeasonalSplash";
import { seasonFor, seasonOverride } from "./utils/seasons";
import { readSplashRecord, shouldShowSplash, writeSplashRecord } from "./utils/splashPolicy";
import { getPlatformSync } from "./utils/platformUtils";
import { ensureNotificationTapListener } from "./services/pushNotifications";

// QA aid for "Break the ice": ?icebreakerPreview=1 turns on a mocked, network-free preview of the send
// popup (quota of 3 chances, fake successful send) and remembers it; ?icebreakerPreview=0 turns it off.
// Captured here, before the router can rewrite the URL. Without the flag nothing changes.
try {
  const m = /[?&]icebreakerPreview=(0|1)(&|$)/.exec(window.location.search);
  if (m) {
    if (m[1] === "1") window.localStorage.setItem("dl_icebreaker_preview", "1");
    else window.localStorage.removeItem("dl_icebreaker_preview");
  }
} catch {
  /* storage unavailable: preview simply stays off */
}

// Registers the OS notification-tap listener once, permanently, before
// React even mounts - deliberately outside any component lifecycle. It used
// to be registered/torn down alongside a per-session init/cleanup cycle
// (SupabasePushNotificationService), which had a real race on the
// cold-start remount (MainApp mounts, unmounts when Index flips `loading`,
// remounts) that could leave the app with no tap listener at all for the
// rest of the session - see ensureNotificationTapListener's own comment in
// pushNotifications.ts for the exact mechanics. No-ops on web.
ensureNotificationTapListener();

// Mark web (browser) sessions before first paint so index.css can center the app in a
// phone-width column on wide viewports. Runs synchronously off the capacitor:/file: URL
// protocol check, so native iOS/Android — which should stay pixel-identical — never gets
// this class, even before the Capacitor JS bridge finishes loading.
if (getPlatformSync() === 'web') {
  document.documentElement.classList.add('platform-web');
}

// Motion tier, decided once before first paint (see src/motion.css):
//   reduced = user asked for less motion, Data Saver is on, or the link is 2G/3G
//   lite    = weak device (<=2GB RAM or <=4 cores): same motion, much shorter
//   full    = everything else
try {
  type NetInfo = { saveData?: boolean; effectiveType?: string };
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: NetInfo };
  const conn = nav.connection;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const slowLink = !!conn && (conn.saveData === true || ['slow-2g', '2g', '3g'].includes(conn.effectiveType ?? ''));
  const weakDevice =
    (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) ||
    (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4);
  document.documentElement.dataset.motion = reducedMotion || slowLink ? 'reduced' : weakDevice ? 'lite' : 'full';

  // Photo fade-in: <img data-fade> starts transparent and gets .is-loaded on load
  // (images that never fire load still appear via the CSS fail-safe).
  document.addEventListener(
    'load',
    (event) => {
      const el = event.target;
      if (el instanceof HTMLImageElement && el.hasAttribute('data-fade')) el.classList.add('is-loaded');
    },
    true,
  );
} catch {
  // Motion is cosmetic - never let detection break startup.
}

// Suppress non-critical console output in production
if (import.meta.env.PROD) {
  const originalError = console.error;
  console.error = (...args) => {
    const errorStr = args.join(' ');
    // Suppress known non-critical errors
    if (
      errorStr.includes('CORS') ||
      errorStr.includes('net::ERR_FAILED') ||
      errorStr.includes('net::ERR_ABORTED') ||
      errorStr.includes('Failed to fetch') ||
      errorStr.includes('NetworkError') ||
      errorStr.includes('Canvas2D') ||
      errorStr.includes('willReadFrequently') ||
      errorStr.includes('postMessage')
    ) {
      return; // Suppress these errors
    }
    originalError.apply(console, args);
  };

  // Suppress all debug logs in production
  console.debug = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.log = () => {};
}

// The full opening splash (logo + seasonal greeting) plays on the first launch, once a day on holidays, and at most every
// 3 days otherwise (see utils/splashPolicy.ts). Every other cold start only shows the quick logo screen, which goes away
// the moment the app is ready. Decided once per launch, before the first paint.
const SPLASH_FULL = (() => {
  try {
    const forced = seasonOverride();
    const now = new Date();
    const season = forced ?? seasonFor(now);
    const show = shouldShowSplash({ now, season: season.id, last: readSplashRecord(), forced: !!forced });
    if (show) writeSplashRecord(now, season.id);
    return show;
  } catch {
    return true;
  }
})();
// Data Saver / slow link / reduced-motion users (data-motion="reduced") get a shorter one: nothing should hold them up.
const SPLASH_MIN_MS = !SPLASH_FULL ? 0 : document.documentElement.dataset.motion === 'reduced' ? 2000 : 5000;
const SPLASH_FADE_MS = 340;

const AppWrapper = () => {
  const [splashMinElapsed, setSplashMinElapsed] = React.useState(SPLASH_MIN_MS === 0);
  const [splashGone, setSplashGone] = React.useState(false);
  React.useEffect(() => {
    if (SPLASH_MIN_MS === 0) return undefined;
    const id = window.setTimeout(() => setSplashMinElapsed(true), SPLASH_MIN_MS);
    return () => window.clearTimeout(id);
  }, []);
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [hasSession, setHasSession] = React.useState(false);
  const [user, setUser] = React.useState<any | null>(null);
  const authSubscriptionRef = React.useRef<{ unsubscribe: () => void } | null>(null);

  // Lock body and set root heights so only the inner app scrolls. This prevents mobile browsers
  // from resizing the viewport (100vh) and causing fixed elements to float during touch/drag.
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const applyFill = () => {
      // Use fill-available for iOS/modern browsers
      html.style.height = ' -webkit-fill-available';
      html.style.minHeight = '-webkit-fill-available';
      body.style.height = '-webkit-fill-available';
      body.style.minHeight = '-webkit-fill-available';
      if (root) {
        root.style.height = '-webkit-fill-available';
        root.style.minHeight = '-webkit-fill-available';
      }

      // Lock body scroll so only the app container scrolls
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.width = '100%';
    };

    applyFill();

    // Re-apply on viewport changes (visualViewport helps with iOS keyboard/resize)
    const vv = (window as any).visualViewport;
    const onViewportChange = () => applyFill();
    if (vv && vv.addEventListener) {
      vv.addEventListener('resize', onViewportChange);
      vv.addEventListener('scroll', onViewportChange);
    } else {
      window.addEventListener('resize', onViewportChange);
    }

    return () => {
      // Restore body/html on unmount
      html.style.height = '';
      html.style.minHeight = '';
      body.style.height = '';
      body.style.minHeight = '';
      if (root) {
        root.style.height = '';
        root.style.minHeight = '';
      }
      body.style.overflow = '';
      body.style.position = '';
      body.style.width = '';

      if (vv && vv.removeEventListener) {
        vv.removeEventListener('resize', onViewportChange);
        vv.removeEventListener('scroll', onViewportChange);
      } else {
        window.removeEventListener('resize', onViewportChange);
      }
    };
  }, []);

  React.useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize native Google Auth on mobile platforms
        void import('./utils/googleNativeAuth')
          .then(({ initializeGoogleAuth }) => initializeGoogleAuth())
          .catch(() => {
            // ignore startup auth init import errors
          });
        
        // Quick OAuth redirect check (non-blocking)
        // If we detect an OAuth fragment or error in the URL, ensure the app
        // navigates to `/auth/callback` (preserving the fragment) so the
        // OAuth callback page can parse and hydrate the session. Previously
        // this redirected to the site root which dropped the fragment and
        // caused `No session available after OAuth redirect` errors.
        const currentUrl = window.location.href;
        const hasOAuthFragment = currentUrl.includes('#access_token=') || currentUrl.includes('#error=') || currentUrl.includes('?code=');
        if (hasOAuthFragment) {
          const loc = window.location;
          // If we're already on /auth/callback, don't change anything
          if (!loc.pathname.startsWith('/auth/callback')) {
            const target = window.location.origin + '/auth/callback' + (loc.hash || loc.search || '');
            window.location.href = target;
            return;
          }
        }

        // Show the app immediately for faster perceived performance
        setIsInitialized(true);

        // ⭐ ANDROID OPTIMIZATION: Defer heavy background operations more on Android
        // Android WebView initialization is slower - prioritize visible UI first
        const initDelay = /Android/i.test(navigator.userAgent) ? 300 : 100;

        // Start IAP (StoreKit/Google Play Billing) warming up now, in parallel
        // with auth bootstrap below, instead of waiting for it to finish first.
        // The billing connection setup is a real native round trip with its
        // own latency we can't shorten - but it doesn't depend on auth being
        // resolved, so chaining it after auth's own (variable) latency was
        // pure added delay. This is exactly what made navigating straight to
        // the premium page right after launch (before auth + this were both
        // done) catch IAP still not ready - starting it here instead gives it
        // a head start of however long auth bootstrap takes.
        setTimeout(async () => {
          try {
            const { Capacitor } = await import('@capacitor/core');
            const platform = Capacitor.getPlatform();

            if (platform === 'ios') {
              const { initIAP } = await import('./iap');
              await initIAP();
            } else if (platform === 'android') {
              const { initGoogleIAP } = await import('./iap-google');
              await initGoogleIAP();
            }
          } catch (error) {
            console.error('[App] Failed to initialize In-App Purchase:', error);
            // Log but don't crash - IAP is optional feature
          }
        }, initDelay);

        // Auth bootstrap MUST happen before rendering routes (prevents Welcome/Login flash)
        try {
          // Get existing session from storage first
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          // CRITICAL: Only clear session on explicit errors, not on missing session
          if (session) {
            setHasSession(true);
            setUser(session.user);
          } else if (!sessionError) {
            // No session found, but no error - user is genuinely not logged in
            setHasSession(false);
            setUser(null);
          }
          // If there's an error, don't change the state - might be a network issue

          // Keep session signal up-to-date
          // CRITICAL: ONLY log out user on explicit SIGNED_OUT event
          // Token refresh failures, network errors, etc. should NEVER log the user out
          // Supabase handles retries automatically - we just need to not interfere
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            // ONLY SIGNED_OUT should clear the session
            if (event === 'SIGNED_OUT') {
              clearAllUserCaches();
              setHasSession(false);
              setUser(null);
              return;
            }

            // Update session on successful auth events
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              if (nextSession) {
                noteSignedInUser(nextSession.user?.id);
                setHasSession(true);
                setUser(nextSession.user);
              }
              return;
            }

            if (event === 'INITIAL_SESSION') {
              // Only update if we have a session - don't clear on null
              if (nextSession) {
                noteSignedInUser(nextSession.user?.id);
                setHasSession(true);
                setUser(nextSession.user);
              }
              return;
            }

            if (event === 'USER_UPDATED') {
              if (nextSession) setUser(nextSession.user);
            }

            // IGNORE all other events - they should not affect session state
            // This includes: PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED, etc.
          });

          authSubscriptionRef.current = subscription;

          // Background session keep-alive check every 5 minutes
          // This silently refreshes the session if needed, without ever forcing logout
          const refreshInterval = setInterval(async () => {
            try {
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (currentSession) {
                // Session is valid - keep state in sync
                setHasSession(true);
                setUser(currentSession.user);
              }
              // If no session, DON'T log out - could be a network issue
              // Only explicit SIGNED_OUT event should log out
            } catch {
              // Network error during refresh check - completely ignore
              // The user stays logged in with their cached session
            }
          }, 5 * 60 * 1000); // 5 minutes

          (authSubscriptionRef.current as any)._refreshInterval = refreshInterval;
        } catch {
          // If auth bootstrap fails (offline, transient errors), do NOT force a sign-out.
          // Keep current state (defaults to logged out on cold start, but won't clear a valid session).
        } finally {
          setAuthChecked(true);
        }

        // IAP init now starts above, in parallel with auth bootstrap - this
        // timer only covers the remaining (non-IAP) background plugin setup.
        setTimeout(async () => {
          // Initialize Capacitor plugins (background)
          const { Capacitor } = await import('@capacitor/core');
          if (Capacitor.isNativePlatform()) {
            try {
              const [{ Keyboard }, { SafeArea, SystemBarsStyle }, { App }] = await Promise.all([
                import('@capacitor/keyboard'),
                import('@capacitor-community/safe-area'),
                import('@capacitor/app')
              ]);

              // Configure system bars. @capacitor-community/safe-area replaces
              // @capacitor/status-bar entirely - it detects broken WebView/Chromium
              // versions and pads the WebView natively so env(safe-area-inset-*) is
              // reliably correct on Android too, the same way it already was on iOS
              // and web. No more forcing overlaysWebView off on Android and no more
              // manually mirroring env() into CSS vars - every screen just uses plain
              // env(safe-area-inset-*) now, on every platform.
              try {
                await SafeArea.setSystemBarsStyle({ style: SystemBarsStyle.Dark });
              } catch {
                // System bars API unavailable — ignore
              }

              // Configure keyboard: do not modify body padding; handled by useChatKeyboardFix
              Keyboard.addListener('keyboardWillShow', () => {
                // No-op: layout handled via CSS variables in useChatKeyboardFix
              });

              Keyboard.addListener('keyboardWillHide', () => {
                // No-op: layout handled via CSS variables in useChatKeyboardFix
              });

              // ✅ Deep link OAuth handling is done in useMobileOAuth hook (AppRoutes.tsx)
              // ❌ REMOVED duplicate appUrlOpen listener to prevent conflicts
              // Only ONE appUrlOpen listener should exist - it's in useMobileOAuth.ts

            } catch (error) {
              // Ignore plugin initialization failures
            }
          }

          // Background initialization complete
        }, initDelay); // ⭐ ANDROID FIX: Dynamic delay based on platform

      } catch (error) {
        console.error('App initialization error:', error);
        setIsInitialized(true); // Show app even if initialization fails
      }
    };

    initializeApp();

    return () => {
      const sub = authSubscriptionRef.current;
      authSubscriptionRef.current = null;
      if (sub) {
        // Clear refresh interval if exists
        if ((sub as any)._refreshInterval) {
          clearInterval((sub as any)._refreshInterval);
        }
        if (typeof sub.unsubscribe === 'function') {
          try { sub.unsubscribe(); } catch {}
        }
      }
    };
  }, []);

  const ready = isInitialized && authChecked;
  const splashDone = ready && splashMinElapsed;

  // Once the splash has faded out, take it off the screen for good.
  React.useEffect(() => {
    if (!splashDone) return undefined;
    const id = window.setTimeout(() => setSplashGone(true), SPLASH_FADE_MS + 40);
    return () => window.clearTimeout(id);
  }, [splashDone]);

  // One splash instance for the whole opening (its animation must not restart when the app becomes ready).
  return (
    <>
      {ready && <App user={user} isAuthenticated={hasSession} />}
      {!splashGone && (
        <SeasonalSplash
          leaving={splashDone}
          durationMs={SPLASH_MIN_MS}
          variant={SPLASH_FULL ? 'full' : 'quick'}
          onSkip={() => setSplashMinElapsed(true)}
        />
      )}
    </>
  );
};

// Vite fires this when a lazy chunk (or its CSS) can't be fetched - i.e. a new version replaced the files while
// this copy of the app stayed open. Reload once (cooldown-guarded) instead of leaving a dead tab.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForStaleChunk()) event.preventDefault();
});

// Store root to prevent double mount warning in development
const rootElement = document.getElementById("root")!;
if (!(rootElement as any)._reactRoot) {
  (rootElement as any)._reactRoot = ReactDOM.createRoot(rootElement);
}
(rootElement as any)._reactRoot.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
 