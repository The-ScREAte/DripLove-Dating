
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { supabase } from './integrations/supabase/client';

// 👉 Capacitor keyboard handling
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { initializeSafeAndroidOptimizations } from './utils/safeAndroidOptimizations';

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
