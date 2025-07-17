
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { supabase } from './integrations/supabase/client';

// 👉 Capacitor keyboard handling
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';

if (Capacitor.isNativePlatform()) {
  Keyboard.setScroll({ isDisabled: true });
  Keyboard.setResizeMode({ mode: KeyboardResize.Native });
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
