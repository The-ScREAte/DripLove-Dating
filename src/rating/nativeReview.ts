/**
 * Native in-app review. Apple (SKStoreReviewController) and Google (Play
 * In-App Review) decide whether the sheet really appears and never tell us,
 * so the result only says whether the call itself succeeded.
 *
 * Only call this from the happy-moment engine (RatingHost) - Google says an app
 * must not expose a button that triggers it (the quota may swallow the call).
 * User-initiated "Rate" buttons use openStoreReviewPage() instead.
 */
import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const requestNativeReview = async (): Promise<'requested' | 'unsupported' | 'error'> => {
  if (!isNativeApp()) return 'unsupported';
  try {
    const { RateApp } = await import('capacitor-rate-app');
    await RateApp.requestReview();
    return 'requested';
  } catch (error) {
    console.warn('[Rating] native review call failed:', error);
    return 'error';
  }
};
