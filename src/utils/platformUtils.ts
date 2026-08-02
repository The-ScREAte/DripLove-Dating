/**
 * Platform detection utilities for mobile app and web environments
 */

// ⭐ ANDROID PERFORMANCE FIX: Lazy platform detection with caching
// Avoids synchronous Capacitor import that blocks Android main thread
let cachedPlatform: string | null = null;
let capacitorModule: any = null;

const detectPlatformFromRuntime = (): string => {
  try {
    const globalCapacitor = (globalThis as any)?.Capacitor;
    if (globalCapacitor && typeof globalCapacitor.getPlatform === 'function') {
      const p = globalCapacitor.getPlatform();
      if (typeof p === 'string' && p) return p;
    }
  } catch {
    // ignore
  }

  try {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : '';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (protocol === 'capacitor:' || protocol === 'file:') {
      if (/Android/i.test(ua)) return 'android';
      if (/(iPhone|iPad|iPod)/i.test(ua)) return 'ios';
    }
  } catch {
    // ignore
  }

  return 'web';
};

export const getPlatformSafe = async (): Promise<string> => {
  if (cachedPlatform) return cachedPlatform;
  try {
    if (!capacitorModule) {
      capacitorModule = await import('@capacitor/core');
    }
    cachedPlatform = capacitorModule.Capacitor.getPlatform();
    return cachedPlatform;
  } catch {
    cachedPlatform = 'web';
    return 'web';
  }
};

// Synchronous version using cached value (safe after first async call)
export const getPlatformSync = (): string => {
  if (!cachedPlatform) {
    cachedPlatform = detectPlatformFromRuntime();
  }
  return cachedPlatform;
};

// Initialize platform detection early (non-blocking)
getPlatformSafe();

export const isAndroidPlatform = (): boolean => getPlatformSync() === 'android';
export const isIOSPlatform = (): boolean => getPlatformSync() === 'ios';

/**
 * Check if the app is running in a mobile Capacitor environment
 */
export const isMobileApp = () => {
  // Primary signal: the native bridge itself, independent of the WKWebView's
  // URL scheme/hostname (which now mirrors www.driplove.love for Associated Domains).
  try {
    const globalCapacitor = (globalThis as any)?.Capacitor;
    if (globalCapacitor && typeof globalCapacitor.isNativePlatform === 'function' && globalCapacitor.isNativePlatform()) {
      return true;
    }
  } catch {
    // ignore
  }

  // Fallbacks for the brief window before the Capacitor bridge attaches.
  const protocol = window.location.protocol;
  if (protocol === 'capacitor:' || protocol === 'file:') return true;
  if (typeof window.location.href === 'string' && window.location.href.startsWith('driplove://')) return true;

  return false;
};

/**
 * Check if the app is running on localhost
 */
export const isLocalhost = () => {
  const result = typeof window !== 'undefined' && 
         (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  return result;
};

/**
 * Check if the app is running in a web browser
 */
export const isWebBrowser = () => {
  return !isMobileApp();
};

/**
 * Get the current platform type
 */
export const getPlatformType = (): 'mobile' | 'web' | 'localhost' => {
  if (isMobileApp()) return 'mobile';
  if (isLocalhost()) return 'localhost';
  return 'web';
};

/**
 * Log platform information for debugging
 */
export const logPlatformInfo = () => {
};
