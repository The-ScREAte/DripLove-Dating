import { Capacitor } from '@capacitor/core';

/**
 * One place that knows how a denied permission (camera, microphone, location,
 * photos, notifications) can be fixed on each platform.
 *
 * - iOS app: the 'app-settings:' URL opens this app's page in Settings.
 * - Android app: the installed plugins cannot open the app's Settings page
 *   (@capacitor/app-launcher only fires an ACTION_VIEW intent, which has no
 *   handler for it), so callers show a two-line instruction instead
 *   ("Settings -> Apps -> DripLove -> Permissions"). Adding a settings plugin
 *   (e.g. @capacitor-community/native-settings) would let this open it directly.
 * - Web: the browser decides; callers offer "Try again" to re-ask.
 */
export type SettingsPlatform = 'ios' | 'android' | 'web';

export function getSettingsPlatform(): SettingsPlatform {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

/** True only where we can send the user straight to this app's Settings page. */
export function canOpenAppSettings(): boolean {
  return getSettingsPlatform() === 'ios';
}

/** Resolves true if Settings was opened. Never throws. */
export async function openAppSettings(): Promise<boolean> {
  if (!canOpenAppSettings()) return false;
  try {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    const res = await AppLauncher.openUrl({ url: 'app-settings:' });
    return res.completed !== false;
  } catch {
    return false;
  }
}

/** True when a getUserMedia / Capacitor error means the user (or OS) refused access. */
export function isPermissionDeniedError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
}
