import { useEffect, useState } from 'react';
import { pushNotificationService } from '@/services/pushNotifications';

export const usePushNotifications = (userId?: string) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializePushNotifications = async () => {
      if (!userId) return;

      try {
        setIsSupported(pushNotificationService.isSupported());
        
        if (!pushNotificationService.isSupported()) {
          console.log('📱 Push notifications not supported on this platform');
          return;
        }

        const initialized = await pushNotificationService.initialize(userId);
        setIsInitialized(initialized);
        
        if (initialized) {
          setDeviceToken(pushNotificationService.getDeviceToken());
          setError(null);
        } else {
          setError('Failed to initialize push notifications');
        }
      } catch (err) {
        console.error('❌ Error initializing push notifications:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsInitialized(false);
      }
    };

    initializePushNotifications();

    // Cleanup on unmount
    return () => {
      pushNotificationService.unregister();
    };
  }, [userId]);

  const sendNotification = async (notification: {
    title: string;
    body: string;
    userId?: string;
    type?: 'match' | 'message' | 'like' | 'system' | 'admin';
    data?: Record<string, string | number | boolean>;
  }) => {
    try {
      const success = await pushNotificationService.sendNotification(notification);
      return success;
    } catch (err) {
      console.error('❌ Error sending notification:', err);
      return false;
    }
  };

  return {
    isInitialized,
    isSupported,
    deviceToken,
    error,
    sendNotification,
    // Convenience methods
    sendMatchNotification: pushNotificationService.sendMatchNotification.bind(pushNotificationService),
    sendMessageNotification: pushNotificationService.sendMessageNotification.bind(pushNotificationService),
    sendLikeNotification: pushNotificationService.sendLikeNotification.bind(pushNotificationService),
    sendAdminNotification: pushNotificationService.sendAdminNotification.bind(pushNotificationService),
  };
};
