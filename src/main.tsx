
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Silence verbose console logs across the app when true.
// Set to `false` to restore console.log/debug output.
const SILENCE_APP_LOGS = true;
if (SILENCE_APP_LOGS) {
  // Preserve error/warn but silence regular logs and debug statements
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

// Create a loading screen component
const LoadingScreen = () => (
  <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-pink-500 to-purple-600">
    <div className="text-center">
      <div className="mb-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center animate-pulse">
          <span className="text-2xl">💕</span>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">DripLove</h1>
      <div className="flex items-center justify-center space-x-1">
        <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
    </div>
  </div>
);

// App wrapper that handles initialization
const AppWrapper = () => {
  const [isInitialized, setIsInitialized] = React.useState(false);

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
        // Quick OAuth redirect check (non-blocking)
        const currentUrl = window.location.href;
        if (currentUrl.includes('#access_token=') || currentUrl.includes('#error=')) {
          window.location.href = window.location.origin + window.location.pathname;
          return;
        }

        // Show the app immediately for faster perceived performance
        setIsInitialized(true);

        // Initialize heavy operations in the background
        setTimeout(async () => {
          try {
            // Initialize in-app purchase system (background)
            const { initIAP } = await import('./iap');
            console.log('Initializing IAP...');
            await initIAP();
            console.log('IAP initialization complete');
          } catch (error) {
            console.log('IAP initialization failed:', error);
          }

          // Initialize Capacitor plugins (background)
          const { Capacitor } = await import('@capacitor/core');
          if (Capacitor.isNativePlatform()) {
            try {
              const [{ Keyboard }, { StatusBar, Style }] = await Promise.all([
                import('@capacitor/keyboard'),
                import('@capacitor/status-bar')
              ]);

              // Configure status bar
              await StatusBar.setStyle({ style: Style.Dark });
              
              // Configure keyboard
              Keyboard.addListener('keyboardWillShow', () => {
                document.body.style.paddingBottom = '0px';
              });
              
              Keyboard.addListener('keyboardWillHide', () => {
                document.body.style.paddingBottom = '0px';
              });
              
              // Set up safe area CSS variables (using environment variables)
              document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top, 0px)');
              document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom, 0px)');
              document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left, 0px)');
              document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right, 0px)');
              
            } catch (error) {
              console.log('Capacitor plugin initialization failed:', error);
            }
          }

          // Initialize Supabase auth check (background)
          try {
            const { supabase } = await import('./integrations/supabase/client');
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              console.log('User session found:', user.id);
            }
          } catch (error) {
            console.log('Auth check error:', error);
          }

          console.log('Background initialization complete');
        }, 100); // Small delay to ensure app renders first

      } catch (error) {
        console.error('App initialization error:', error);
        setIsInitialized(true); // Show app even if initialization fails
      }
    };

    initializeApp();
  }, []);

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return <App />;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
