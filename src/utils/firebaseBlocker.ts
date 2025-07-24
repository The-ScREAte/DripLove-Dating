// Prevent Firebase messaging from initializing in unsupported environments
// This fixes the "messaging/unsupported-browser" error in Capacitor WebView

import { Capacitor } from '@capacitor/core';

export function preventFirebaseMessaging() {
  // Only block on native platforms (Capacitor WebView)
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Block Firebase messaging initialization
    if (typeof window !== 'undefined') {
      // Create a mock Firebase messaging that throws supported browser error
      const mockMessaging = {
        isSupported: () => Promise.resolve(false),
        getMessaging: () => {
          throw new Error('Firebase messaging is not supported in Capacitor WebView');
        }
      };

      // Override any potential Firebase imports
      Object.defineProperty(window, 'firebase', {
        value: undefined,
        writable: false,
        configurable: false
      });

      // Block service worker registration for Firebase
      if ('serviceWorker' in navigator) {
        const originalRegister = navigator.serviceWorker.register;
        navigator.serviceWorker.register = function(scriptURL: string | URL, options?: RegistrationOptions) {
          const url = scriptURL.toString();
          if (url.includes('firebase') || url.includes('messaging')) {
            console.warn('⚠️ Blocked Firebase service worker registration in Capacitor');
            return Promise.reject(new Error('Firebase service workers not supported in Capacitor'));
          }
          return originalRegister.call(this, scriptURL, options);
        };
      }
    }
  } catch (error) {
    console.warn('⚠️ Error setting up Firebase blocker:', error);
  }
}