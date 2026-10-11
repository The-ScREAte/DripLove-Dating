
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config"; // Initialize i18n
import { supabase } from "./integrations/supabase/client";
import { clearChatCache } from "./cache/chatCache";
import HoppingLogo from "./components/HoppingLogo";
import { getPlatformSync } from "./utils/platformUtils";
import { ensureNotificationTapListener } from "./services/pushNotifications";

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

// Minimal branded loading screen used during bootstrap/session hydration.
// Same background as the native splash screen (#7A0A40, both platforms) and
// Index.tsx's own loading screen further down the boot sequence - three
// different loading screens with three different colors used to fire in a
// row on cold start (native splash -> this -> Index's), each swap reading
// as a visible "blink" purely from the background color jumping, even
// though nothing was actually broken. One consistent color removes that.
const LoadingScreen = () => (
  <div className="w-full h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#3d0320] via-[#7a0a40] to-[#d6136e]">
    <HoppingLogo size={64} />
  </div>
);

// App wrapper that handles initialization
const AppWrapper = () => {
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
              clearChatCache();
              if (typeof window !== 'undefined') {
                const w = window as Window & {
                  chatMatchesCache?: Map<string, unknown>;
                  chatMessagesCache?: Map<string, unknown>;
                };
                w.chatMatchesCache?.clear();
                w.chatMessagesCache?.clear();
              }
              setHasSession(false);
              setUser(null);
              return;
            }

            // Update session on successful auth events
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              if (nextSession) {
                setHasSession(true);
                setUser(nextSession.user);
              }
              return;
            }

            if (event === 'INITIAL_SESSION') {
              // Only update if we have a session - don't clear on null
              if (nextSession) {
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

  if (!isInitialized || !authChecked) {
    return <LoadingScreen />;
  }

  return <App user={user} isAuthenticated={hasSession} />;
};

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
 