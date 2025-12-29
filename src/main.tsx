
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeGoogleAuth } from "./utils/googleNativeAuth";
import "./i18n/config"; // Initialize i18n

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

// Minimal loading screen component - no branding
const LoadingScreen = () => (
  <div className="w-full h-screen flex items-center justify-center bg-white">
    <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin"></div>
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
        initializeGoogleAuth();
        
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

        // Auth bootstrap MUST happen before rendering routes (prevents Welcome/Login flash)
        try {
          const { supabase } = await import('./integrations/supabase/client');
          
          // Get existing session from storage first
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            setHasSession(true);
            setUser(session.user);
          } else {
            setHasSession(false);
            setUser(null);
          }

          // Keep session signal up-to-date
          // IMPORTANT: Only log out user on explicit SIGNED_OUT event
          // Token refresh failures should NOT log the user out - Supabase handles retries automatically
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            // Handle specific auth events
            if (event === 'SIGNED_OUT') {
              // User explicitly signed out - only time we clear the session
              setHasSession(false);
              setUser(null);
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              // User signed in or token refreshed - update session
              if (nextSession) {
                setHasSession(true);
                setUser(nextSession.user);
              }
            } else if (event === 'INITIAL_SESSION') {
              // Initial session on app load
              setHasSession(!!nextSession);
              setUser(nextSession?.user ?? null);
            } else if (event === 'USER_UPDATED') {
              // User profile updated - update user but keep session
              if (nextSession) {
                setUser(nextSession.user);
              }
            }
            // CRITICAL: For all other events (PASSWORD_RECOVERY, etc.), do NOT change auth state
            // This prevents accidental logouts from token refresh edge cases
          });

          authSubscriptionRef.current = subscription;
          
          // Background session refresh check every 10 minutes
          // This ensures the session stays alive even if the app is in the background
          const refreshInterval = setInterval(async () => {
            try {
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (currentSession) {
                // Session is still valid, Supabase auto-refreshes tokens
                // Just ensure our state is in sync
                setHasSession(true);
                setUser(currentSession.user);
              }
              // If no session and we had one before, don't auto-logout
              // Let the explicit SIGNED_OUT event handle that
            } catch {
              // Network error during refresh check - ignore, don't logout
            }
          }, 10 * 60 * 1000); // 10 minutes
          
          // Store interval for cleanup
          (authSubscriptionRef.current as any)._refreshInterval = refreshInterval;
          
        } catch {
          // If Supabase client fails to load, don't change existing session state
          // This prevents logouts due to network issues on app load
          setHasSession(false);
          setUser(null);
        } finally {
          setAuthChecked(true);
        }

        // Initialize heavy operations in the background
        setTimeout(async () => {
          try {
            // Initialize in-app purchase systems (background)
            const { Capacitor } = await import('@capacitor/core');
            const platform = Capacitor.getPlatform();
            
            if (platform === 'ios') {
              // Apple IAP for iOS
              const { initIAP } = await import('./iap');
              await initIAP();
            } else if (platform === 'android') {
              // Google IAP for Android
              const { initGoogleIAP } = await import('./iap-google');
              await initGoogleIAP();
            }
          } catch (error) {
            console.error('[App] Failed to initialize In-App Purchase:', error);
            // Log but don't crash - IAP is optional feature
          }

          // Initialize Capacitor plugins (background)
          const { Capacitor } = await import('@capacitor/core');
          if (Capacitor.isNativePlatform()) {
            try {
              const [{ Keyboard }, { StatusBar, Style }, { App }] = await Promise.all([
                import('@capacitor/keyboard'),
                import('@capacitor/status-bar'),
                import('@capacitor/app')
              ]);

              // Configure status bar
              await StatusBar.setStyle({ style: Style.Dark });
              
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
              
              // Set up safe area CSS variables (using environment variables)
              document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top, 0px)');
              document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom, 0px)');
              document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left, 0px)');
              document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right, 0px)');
              
            } catch (error) {
              // Ignore plugin initialization failures
            }
          }

          // Background initialization complete
        }, 100); // Small delay to ensure app renders first

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
