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
import { handlePushNotificationError, logPushNotificationError, shouldRetryPushNotificationSetup } from '@/utils/pushNotificationErrorHandler';

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
        
        // Initialize the service with retry logic
        let initialized = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!initialized && retryCount < maxRetries) {
          try {
            initialized = await initializePushNotifications(userId);
            if (initialized) {
              setIsInitialized(true);
              setError(null);
              // Load unread notifications count
              const unreadNotifications = await getUnreadNotifications(userId);
              setUnreadCount(unreadNotifications.length);
              break;
            }
          } catch (initError) {
            const errorInfo = handlePushNotificationError(initError);
            logPushNotificationError(errorInfo);
            
            if (shouldRetryPushNotificationSetup(errorInfo) && retryCount < maxRetries - 1) {
              retryCount++;
              // ...removed console.log...
              await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Progressive delay
            } else {
              setError(errorInfo.message);
              setIsInitialized(false);
              break;
            }
          }
        }
        
        if (!initialized) {
        }
      } catch (err) {
        const errorInfo = handlePushNotificationError(err);
        logPushNotificationError(errorInfo);
        setError(errorInfo.message);
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

  const sendMultipleLikesNotification = async (targetUserId: string, likeCount: number) => {
    const message = likeCount === 1 
      ? "Someone is showing interest in you. Check them out!"
      : `${likeCount} people are showing interest in you. Check them out!`;
    
    return sendNotification({
      title: "💕 Others are showing interest!",
      body: message,
      userId: targetUserId,
      type: 'like',
      data: { likeCount: likeCount.toString() }
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
    sendMultipleLikesNotification,
    sendAdminNotification,
    markAsRead,
    refreshUnreadCount
  };
};
