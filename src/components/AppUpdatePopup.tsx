import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Download, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

interface AppUpdateConfig {
  id: string;
  is_enabled: boolean;
  current_version: string;
  target_platform: string;
  play_store_url: string;
  app_store_url: string;
  universal_link: string;
  update_message: string;
}

const AppUpdatePopup = () => {
  const [showPopup, setShowPopup] = useState(false);
  const [config, setConfig] = useState<AppUpdateConfig | null>(null);
  const [currentPlatform, setCurrentPlatform] = useState<'ios' | 'android' | 'web'>('web');
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    detectPlatformAndVersion();
  }, []);

  useEffect(() => {
    if (appVersion !== null && !dismissed) {
      checkForUpdate();
    }
  }, [appVersion, dismissed]);

  const detectPlatformAndVersion = async () => {
    // Detect platform
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') {
      setCurrentPlatform('ios');
    } else if (platform === 'android') {
      setCurrentPlatform('android');
    } else {
      setCurrentPlatform('web');
      // Web users don't need app update prompts
      return;
    }

    // Get app version using Capacitor App plugin
    try {
      const appInfo = await App.getInfo();
      setAppVersion(appInfo.version);
    } catch (error) {
      console.error('Error getting app version:', error);
      // Fallback - set to empty to skip update check
      setAppVersion('');
    }
  };

  const compareVersions = (current: string, required: string): boolean => {
    // Returns true if current version is less than required
    const currentParts = current.split('.').map(Number);
    const requiredParts = required.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const requiredPart = requiredParts[i] || 0;

      if (currentPart < requiredPart) return true;
      if (currentPart > requiredPart) return false;
    }

    return false; // Versions are equal
  };

  const checkForUpdate = async () => {
    // Don't show on web
    if (currentPlatform === 'web') return;

    // Check if already dismissed this session
    const dismissedKey = `update_dismissed_${appVersion}`;
    if (sessionStorage.getItem(dismissedKey)) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('app_update_config')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;

      const updateConfig = data as AppUpdateConfig;
      setConfig(updateConfig);

      // Check if update is enabled
      if (!updateConfig.is_enabled) return;

      // Check if this platform should show the update
      if (updateConfig.target_platform !== 'both' && updateConfig.target_platform !== currentPlatform) {
        return;
      }

      // Compare versions
      if (appVersion && compareVersions(appVersion, updateConfig.current_version)) {
        setShowPopup(true);
      }
    } catch (error) {
      console.error('Error checking for app update:', error);
    }
  };

  const handleUpdate = () => {
    if (!config) return;

    let storeUrl = config.universal_link;

    // If no universal link, use platform-specific URL
    if (!storeUrl || storeUrl.trim() === '') {
      storeUrl = currentPlatform === 'ios' ? config.app_store_url : config.play_store_url;
    }

    // Open the store URL
    if (storeUrl) {
      window.open(storeUrl, '_blank');
    }

    setShowPopup(false);
  };

  const handleDismiss = () => {
    // Remember dismissal for this session and version
    if (appVersion) {
      sessionStorage.setItem(`update_dismissed_${appVersion}`, 'true');
    }
    setDismissed(true);
    setShowPopup(false);
  };

  // Don't render anything on web
  if (currentPlatform === 'web') return null;

  return (
    <Dialog open={showPopup} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Download className="w-6 h-6 text-primary" />
            Update Available
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            {config?.update_message || 'A new version is available! Update now for the best experience.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Version info */}
          <div className="p-3 bg-muted rounded-lg text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Your version:</span>
              <span className="font-medium">{appVersion}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Latest version:</span>
              <span className="font-medium text-primary">{config?.current_version}</span>
            </div>
          </div>

          {/* Platform indicator */}
          <div className="text-center text-sm text-muted-foreground">
            {currentPlatform === 'ios' ? (
              <span>🍎 Opening App Store</span>
            ) : (
              <span>🤖 Opening Play Store</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleUpdate} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Update Now
            </Button>
            <Button variant="ghost" onClick={handleDismiss} className="w-full">
              <X className="w-4 h-4 mr-2" />
              Maybe Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppUpdatePopup;
