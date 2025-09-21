
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Set a CSS variable for the app viewport height to avoid using 100vh directly.
// We prefer visualViewport when available to handle iOS dynamic toolbars.
const setAppHeightVar = () => {
  const height = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${height}px`);
};

setAppHeightVar();
window.addEventListener('resize', setAppHeightVar);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setAppHeightVar);
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
