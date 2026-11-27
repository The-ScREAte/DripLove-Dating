/**
 * Deep links to the store's "write a review" page, for the user-initiated Rate
 * card (Google: don't put a button on the in-app-review API - redirect to the
 * Play Store; Apple: link to the App Store write-review page).
 *
 * Store URLs come from the admin-managed app_update_config row (the same row
 * AppUpdatePopup uses), so nothing is hard-coded except the Android package.
 */
import { Capacitor } from '@capacitor/core';

const ANDROID_PACKAGE = 'com.driplove.dating';

interface StoreConfig {
  app_store_url: string | null;
  play_store_url: string | null;
}

let cached: StoreConfig | null | undefined;

const loadStoreConfig = async (): Promise<StoreConfig | null> => {
  if (cached !== undefined) return cached;
  try {
    // Lazy so the pure URL helpers below stay importable without a browser (tests).
    const { supabase } = await import('@/integrations/supabase/client');
    const { data } = await supabase
      .from('app_update_config')
      .select('app_store_url, play_store_url')
      .limit(1)
      .maybeSingle();
    cached = (data as StoreConfig | null) ?? null;
  } catch {
    cached = null;
  }
  return cached;
};

const withParam = (url: string, key: string, value: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;

/** Ordered list of URLs to try, best first. */
export const buildReviewUrls = (
  platform: 'ios' | 'android',
  cfg: StoreConfig | null
): string[] => {
  if (platform === 'ios') {
    const id = cfg?.app_store_url?.match(/id(\d{6,})/)?.[1];
    const urls: string[] = [];
    if (id) urls.push(`itms-apps://apps.apple.com/app/id${id}?action=write-review`);
    if (cfg?.app_store_url) urls.push(withParam(cfg.app_store_url, 'action', 'write-review'));
    return urls;
  }
  const pkg = cfg?.play_store_url?.match(/[?&]id=([\w.]+)/)?.[1] ?? ANDROID_PACKAGE;
  return [
    `market://details?id=${pkg}`,
    cfg?.play_store_url ?? `https://play.google.com/store/apps/details?id=${pkg}`,
  ];
};

const tryOpen = async (url: string): Promise<boolean> => {
  try {
    if (url.startsWith('http')) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url, windowName: '_system' });
      return true;
    }
    const { AppLauncher } = await import('@capacitor/app-launcher');
    const res = await AppLauncher.openUrl({ url });
    return res.completed !== false;
  } catch {
    return false;
  }
};

/** Opens the store's review page. Resolves false if nothing could be opened. */
export const openStoreReviewPage = async (): Promise<boolean> => {
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return false;
  const urls = buildReviewUrls(platform, await loadStoreConfig());
  for (const url of urls) {
    if (await tryOpen(url)) return true;
  }
  return false;
};

/** Whether the Rate card can do anything on this platform. */
export const canOpenStoreReview = (): boolean => {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android';
};
