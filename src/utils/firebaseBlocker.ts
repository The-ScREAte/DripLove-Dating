// Prevent Firebase messaging from initializing in unsupported environments
// This fixes the "messaging/unsupported-browser" error in Capacitor WebView

import { Capacitor } from '@capacitor/core';

export function preventFirebaseMessaging() {
  // Only block web Firebase on native platforms, not native Firebase
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Block only web Firebase messaging, not native Firebase
    if (typeof window !== 'undefined') {
      
      // Block service worker registration for Firebase web messaging only
      if ('serviceWorker' in navigator) {
        const originalRegister = navigator.serviceWorker.register;
        navigator.serviceWorker.register = function(scriptURL: string | URL, options?: RegistrationOptions) {
          const url = scriptURL.toString();
          if (url.includes('firebase-messaging') || url.includes('firebase-sw')) {
            return Promise.reject(new Error('Firebase web messaging service workers not supported in Capacitor WebView'));
          }
          return originalRegister.call(this, scriptURL, options);
        };
      }

      // Block web Firebase messaging imports only
      const originalImport = window.eval;
      window.eval = function(code: string) {
        if (typeof code === 'string' && code.includes('firebase/messaging')) {
          throw new Error('Firebase web messaging not supported in Capacitor WebView');
        }
        return originalImport.call(this, code);
      };
    }
  } catch (error) {
  }
}