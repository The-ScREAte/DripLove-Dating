import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Download, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { requestPopup } from '@/popups/instance';

interface AppUpdateConfig {
  id: string;
  is_enabled: boolean;
  current_version: string;
  ios_version: string;
  android_version: string;
  target_platform: string;
  play_store_url: string;
  app_store_url: string;
  universal_link: string;
  update_message: string;
}

export interface AppUpdatePayload {
  config: AppUpdateConfig;
  appVersion: string;
  platform: 'ios' | 'android';
}

const compareVersions = (current: string, required: string): boolean => {
  // true when `current` is older than `required`
  const currentParts = current.split('.').map(Number);
  const requiredParts = required.split('.').map(Number);
  for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
    const c = currentParts[i] || 0;
    const r = requiredParts[i] || 0;
    if (c < r) return true;
    if (c > r) return false;
  }
  return false;
};

/**
 * Native apps only: checks once per launch whether a newer store version is required and, if so,
 * ASKS the popup coordinator to show the update dialog (it decides when - never at the same moment
 * as another popup). Renders nothing itself.
 */
export const useAppUpdateCheck = (): void => {
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return; // web needs no update prompt

    (async () => {
      try {
        const { version } = await App.getInfo();
        if (!version) return;
        const { data, error } = await supabase.from('app_update_config').select('*').limit(1).single();
        if (error || !data) return;
        const config = data as AppUpdateConfig;
        if (!config.is_enabled) return;
        if (config.target_platform !== 'both' && config.target_platform !== platform) return;
        const target = platform === 'ios'
          ? (config.ios_version || config.current_version)
          : (config.android_version || config.current_version);
        if (compareVersions(version, target)) {
          requestPopup<AppUpdatePayload>('app-update', { config, appVersion: version, platform });
        }
      } catch (err) {
        console.error('Error checking for app update:', err);
      }
    })();
  }, []);
};

interface AppUpdateDialogProps extends AppUpdatePayload {
  onClose: (converted: boolean) => void;
}

/** The update dialog itself (drawn by the popup host). */
export const AppUpdateDialog = ({ config, appVersion, platform, onClose }: AppUpdateDialogProps) => {
  const handleUpdate = () => {
    let storeUrl = config.universal_link;
    if (!storeUrl || storeUrl.trim() === '') {
      storeUrl = platform === 'ios' ? config.app_store_url : config.play_store_url;
    }
    if (storeUrl && /^(https?:\/\/|market:\/\/|itms-apps:\/\/)/i.test(storeUrl.trim())) window.open(storeUrl.trim(), '_blank');
    onClose(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Download className="w-6 h-6 text-primary" />
            Update Available
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            {config.update_message || 'A new version is available! Update now for the best experience.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="p-3 bg-muted rounded-lg text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Your version:</span>
              <span className="font-medium">{appVersion}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Latest version:</span>
              <span className="font-medium text-primary">
                {platform === 'ios'
                  ? (config.ios_version || config.current_version)
                  : (config.android_version || config.current_version)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="primary" size="md" className="w-full" onClick={handleUpdate}>
              <Download className="w-4 h-4 mr-2" />
              Update Now
            </Button>
            <Button variant="quiet" size="md" className="w-full" onClick={() => onClose(false)}>
              <X className="w-4 h-4 mr-2" />
              Maybe Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
