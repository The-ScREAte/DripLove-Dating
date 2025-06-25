
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

// 🔍 Log current auth user ID
supabase.auth.getUser().then(({ data: { user } }) => {
  console.log("Logged-in Supabase user ID:", user?.id || "No user logged in");
});

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
