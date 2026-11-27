import { Capacitor } from '@capacitor/core';

// Platform helpers shared by the paywall and subscription screens.
//
// In-app purchases themselves live in src/iap.ts (Apple) and src/iap-google.ts
// (Google Play); both validate every purchase server-side before premium is
// granted. A legacy buyIAPProduct() helper that finished transactions WITHOUT
// server validation used to live here and was removed (it had no live caller).

export const isIOS = () => {
  if (Capacitor.getPlatform() === 'ios') return true;
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  return false;
};

export const isNativeApp = () => {
  return Capacitor.isNativePlatform();
};
