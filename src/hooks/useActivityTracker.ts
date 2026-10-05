import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

// Whether the phone currently lets us show notifications. Only the phone's
// own setting matters for pushes - a browser tab's setting says nothing about
// it, so web reports nothing and the stored value is left alone.
const readNotificationPermission = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'granted') return 'granted';
    if (receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return null;
  }
};

const readTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/**
 * Hook to track user activity and update last_login_at
 * This ensures accurate "active users" stats by updating when user is actually using the app
 * Also unarchives users when they become active again
 */
export const useActivityTracker = (userId: string | undefined) => {
  const lastUpdateRef = useRef<number>(0);
  const MIN_UPDATE_INTERVAL = 5 * 60 * 1000; // Only update every 5 minutes max to avoid excessive DB writes

  useEffect(() => {
    if (!userId) return;

    const updateActivity = async () => {
      const now = Date.now();
      
      // Don't update more than once every 5 minutes
      if (now - lastUpdateRef.current < MIN_UPDATE_INTERVAL) {
        return;
      }
      
      lastUpdateRef.current = now;
      
      try {
        await Promise.all([
          // Update last_login_at AND unarchive user if they were archived
          supabase
            .from('profiles')
            .update({
              last_login_at: new Date().toISOString(),
              is_archived: false // Unarchive on activity
            })
            .eq('id', userId),
          // Feeds the push rules: who counts as active, night-time in their
          // own time zone, and no pushes to phones with notifications off.
          readNotificationPermission().then((permission) =>
            supabase.rpc('record_app_open', {
              p_timezone: readTimeZone(),
              p_notification_permission: permission,
            })
          ),
        ]);
      } catch (error) {
        // Silently fail - activity tracking is not critical
        void 0;
      }
    };

    // Update immediately on mount
    updateActivity();

    // Update on visibility change (when user comes back to the app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateActivity();
      }
    };

    // Update periodically while app is active (every 5 minutes)
    const intervalId = setInterval(updateActivity, MIN_UPDATE_INTERVAL);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [userId]);
};
