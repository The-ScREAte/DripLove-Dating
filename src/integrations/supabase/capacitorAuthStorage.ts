import { Capacitor } from '@capacitor/core';

// Supabase expects a storage adapter with async getItem/setItem/removeItem.
// On native (Capacitor), `window.localStorage` can be unreliable depending on
// WebView lifecycle; Capacitor Preferences is more durable.
//
// We also mirror to localStorage when available to preserve backward
// compatibility and enable one-time migration from existing web storage.

type StorageValue = string | null;

type SupabaseStorage = {
  getItem: (key: string) => Promise<StorageValue>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const hasWindowLocalStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const safeLocalStorageGet = (key: string): string | null => {
  if (!hasWindowLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string) => {
  if (!hasWindowLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore write failures (private mode / quota / etc)
  }
};

const safeLocalStorageRemove = (key: string) => {
  if (!hasWindowLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
};

const getPreferences = async () => {
  // Lazy import so web builds don't require the plugin at runtime.
  const mod = await import('@capacitor/preferences');
  return mod.Preferences;
};

export const supabaseAuthStorage: SupabaseStorage = {
  async getItem(key: string) {
    // Native: prefer Preferences
    if (Capacitor.isNativePlatform()) {
      try {
        const Preferences = await getPreferences();
        const { value } = await Preferences.get({ key });
        if (value != null) return value;

        // One-time migration: if localStorage has an older session, copy it.
        const legacy = safeLocalStorageGet(key);
        if (legacy != null) {
          await Preferences.set({ key, value: legacy });
          return legacy;
        }

        return null;
      } catch {
        // Fallback to localStorage/memory if Preferences is unavailable.
        const legacy = safeLocalStorageGet(key);
        if (legacy != null) return legacy;
        return memoryStore.get(key) ?? null;
      }
    }

    // Web: localStorage first, then memory
    const value = safeLocalStorageGet(key);
    if (value != null) return value;
    return memoryStore.get(key) ?? null;
  },

  async setItem(key: string, value: string) {
    // Always mirror to memory as a last-resort fallback.
    memoryStore.set(key, value);

    if (Capacitor.isNativePlatform()) {
      try {
        const Preferences = await getPreferences();
        await Preferences.set({ key, value });
      } catch {
        // ignore
      }
    }

    // Mirror to localStorage when available for compatibility.
    safeLocalStorageSet(key, value);
  },

  async removeItem(key: string) {
    memoryStore.delete(key);

    if (Capacitor.isNativePlatform()) {
      try {
        const Preferences = await getPreferences();
        await Preferences.remove({ key });
      } catch {
        // ignore
      }
    }

    safeLocalStorageRemove(key);
  }
};
