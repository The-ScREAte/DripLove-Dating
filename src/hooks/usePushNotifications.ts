import { useEffect, useState } from 'react';
import { 
  initializePushNotifications, 
  sendPushNotification, 
  requestNotificationPermission,
  markNotificationRead,
  getUnreadNotifications,
  cleanupPushNotifications,
  NotificationPayload
} from '@/services/pushNotifications';

export const usePushNotifications = (userId?: string) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const initializePushNotificationsAsync = async () => {
      if (!userId) return;

      try {
        // Check if push notifications are supported
        const webSupported = 'Notification' in window;
        setIsSupported(webSupported);
        
        if (!webSupported) {
          return;
        }

        // Only check permission, don't request it automatically
        const hasPermission = 'Notification' in window && Notification.permission === 'granted';
        
        // Initialize the service
        const initialized = await initializePushNotifications(userId);
        setIsInitialized(initialized);
        
        if (initialized) {
          setError(null);
          // Load unread notifications count
          const unreadNotifications = await getUnreadNotifications(userId);
          setUnreadCount(unreadNotifications.length);
        } else {
          setError('Failed to initialize push notifications');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsInitialized(false);
      }
    };

    initializePushNotificationsAsync();

    // Cleanup on unmount
    return () => {
      cleanupPushNotifications();
    };
  }, [userId]);

  const sendNotification = async (notification: NotificationPayload) => {
    try {
      const success = await sendPushNotification(notification);
      return success;
    } catch (err) {
      return false;
    }
  };

  const sendMatchNotification = async (matchedUserName: string, targetUserId: string) => {
    return sendNotification({
      title: "🎉 It's a Match!",
      body: `You and ${matchedUserName} liked each other!`,
      userId: targetUserId,
      type: 'match',
      data: { matchedUserName }
    });
  };

  const sendMessageNotification = async (senderName: string, message: string, targetUserId: string, chatId: string) => {
    return sendNotification({
      title: `💬 ${senderName}`,
      body: message,
      userId: targetUserId,
      type: 'message',
      data: { senderName, chatId }
    });
  };

  const sendLikeNotification = async (likerName: string, targetUserId: string) => {
    return sendNotification({
      title: "💖 Someone likes you!",
      body: `${likerName} likes you. Check them out!`,
      userId: targetUserId,
      type: 'like',
      data: { likerName }
    });
  };

  const sendAdminNotification = async (title: string, message: string, targetUserId: string) => {
    return sendNotification({
      title,
      body: message,
      userId: targetUserId,
      type: 'admin'
    });
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const success = await markNotificationRead(notificationId);
      if (success && userId) {
        // Refresh unread count
        const unreadNotifications = await getUnreadNotifications(userId);
        setUnreadCount(unreadNotifications.length);
      }
      return success;
    } catch (err) {
      return false;
    }
  };

  const refreshUnreadCount = async () => {
    if (!userId) return;
    try {
      const unreadNotifications = await getUnreadNotifications(userId);
      setUnreadCount(unreadNotifications.length);
    } catch (err) {
      // Silently handle errors
    }
  };

  return {
    isInitialized,
    isSupported,
    deviceToken,
    error,
    unreadCount,
    sendNotification,
    sendMatchNotification,
    sendMessageNotification,
    sendLikeNotification,
    sendAdminNotification,
    markAsRead,
    refreshUnreadCount
  };
};
