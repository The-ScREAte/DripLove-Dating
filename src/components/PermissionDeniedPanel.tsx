import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Camera, Image as ImageIcon, MapPin, Mic, VideoOff, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canOpenAppSettings, getSettingsPlatform, openAppSettings } from '@/utils/openAppSettings';

export type PermissionKind = 'camera' | 'microphone' | 'cameraMicrophone' | 'location' | 'photos' | 'notifications';

interface Props {
  kind: PermissionKind;
  /** Re-ask / re-check. Used as the single action on Android and the web. */
  onRetry: () => void;
  /** 'dark' = light text for dark screens (default), 'light' = dark text for white sheets. */
  tone?: 'dark' | 'light';
  className?: string;
}

const ICONS: Record<PermissionKind, LucideIcon> = {
  camera: Camera,
  microphone: Mic,
  cameraMicrophone: VideoOff,
  location: MapPin,
  photos: ImageIcon,
  notifications: Bell,
};

/**
 * Shown wherever a permission was refused. One short title, one line that says
 * exactly how to fix it on THIS platform, and ONE action:
 *  - iOS app: "Open Settings" (jumps to the app's Settings page).
 *  - Android app: the 2-step instruction (Settings -> Apps -> DripLove -> Permissions)
 *    plus "Try again" (works until the user chose "don't ask again").
 *  - Web: "Try again" re-asks; the line explains the browser's site settings.
 */
const PermissionDeniedPanel: React.FC<Props> = ({ kind, onRetry, tone = 'dark', className = '' }) => {
  const { t } = useTranslation();
  const platform = getSettingsPlatform();
  const Icon = ICONS[kind];
  const body = platform === 'ios' ? t('permissions.bodyIos') : platform === 'android' ? t('permissions.bodyAndroid') : t('permissions.bodyWeb');
  const dark = tone === 'dark';

  const onAction = async () => {
    if (canOpenAppSettings()) {
      const opened = await openAppSettings();
      if (!opened) onRetry();
      return;
    }
    onRetry();
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${className}`} role="alert">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${dark ? 'bg-white/10' : 'bg-black/5'}`}>
        <Icon className={`h-6 w-6 ${dark ? 'text-white/70' : 'text-black/60'}`} aria-hidden={true} />
      </div>
      <p className={`font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{t(`permissions.title.${kind}`)}</p>
      <p className={`max-w-xs text-sm ${dark ? 'text-white/60' : 'text-gray-600'}`}>{body}</p>
      <Button type="button" variant="primary" size="md" onClick={onAction}>
        {canOpenAppSettings() ? t('permissions.openSettings') : t('permissions.tryAgain')}
      </Button>
    </div>
  );
};

export default PermissionDeniedPanel;
