/**
 * Platform detection utilities for mobile app and web environments
 */

// ⭐ ANDROID PERFORMANCE FIX: Lazy platform detection with caching
// Avoids synchronous Capacitor import that blocks Android main thread
let cachedPlatform: string | null = null;
let capacitorModule: any = null;

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
  return cachedPlatform || 'web';
};

// Initialize platform detection early (non-blocking)
getPlatformSafe();

export const isAndroidPlatform = (): boolean => getPlatformSync() === 'android';
export const isIOSPlatform = (): boolean => getPlatformSync() === 'ios';

/**
 * Check if the app is running in a mobile Capacitor environment
 */
export const isMobileApp = () => {
  // If running under Capacitor (capacitor: protocol) or file protocol, treat as mobile
  // Check protocol first because in Capacitor the hostname may be 'localhost'.
  const protocol = window.location.protocol;
  if (protocol === 'capacitor:' || protocol === 'file:') return true;

  // Custom scheme (driplove://) should also be considered mobile
  if (typeof window.location.href === 'string' && window.location.href.startsWith('driplove://')) return true;

  // Explicit localhost should be treated as web (development) unless protocol indicates Capacitor/file
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return false;

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
