import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { supabase } from './integrations/supabase/client';

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
