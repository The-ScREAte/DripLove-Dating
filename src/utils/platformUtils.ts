/**
 * Platform detection utilities for mobile app and web environments
 */

/**
 * Check if the app is running in a mobile Capacitor environment
 */
export const isMobileApp = () => {
  // Never treat localhost as mobile
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return false;
  }
  // Capacitor, file protocol, or custom scheme
  return (
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:' ||
    window.location.href.startsWith('driplove://')
  );
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
