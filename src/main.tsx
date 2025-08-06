
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from './integrations/supabase/client';

// Handle OAuth deep link for mobile (Capacitor)
if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (url?.includes('#access_token=')) {
      const params = new URLSearchParams(url.split('#')[1]);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      } else {
      }
    }
  });
}

// 👉 Capacitor keyboard handling
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { initializeSafeAndroidOptimizations } from './utils/safeAndroidOptimizations';
import { preventFirebaseMessaging } from './utils/firebaseBlocker';

// Prevent Firebase messaging in Capacitor WebView before any other code runs
preventFirebaseMessaging();

if (Capacitor.isNativePlatform()) {
  try {
    Keyboard.setScroll({ isDisabled: true });
    Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    
    // Initialize safe Android optimizations
    initializeSafeAndroidOptimizations();
  } catch (error) {
    console.error('Error initializing Capacitor:', error);
  }
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
} 

// Get current auth user
supabase.auth.getUser();

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
