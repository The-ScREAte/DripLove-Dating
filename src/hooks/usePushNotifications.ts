import { useEffect, useState, useCallback, useRef } from 'react';
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
import {
  queueLikeEvent,
  recordNotificationSent,
  shouldSendMatchNotification,
  shouldSendMessageNotification,
  recordUserActivity,
  isUserActive,
  hasGlobalCooldownPassed,
  checkAndSendBatchedLikeNotification,
  getLikeQueueCount
} from '@/services/notificationQueue';

export const usePushNotifications = (userId?: string) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const batchCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Core notification sender
  const sendNotificationInternal = useCallback(async (
    title: string,
    body: string,
    targetUserId: string,
    type: string
  ): Promise<boolean> => {
    try {
      const success = await sendPushNotification({
        title,
        body,
        userId: targetUserId,
        type: type as 'match' | 'message' | 'like' | 'system' | 'admin'
      });
      return success;
    } catch (err) {
      return false;
    }
  }, []);

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
              await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
            } else {
              setError(errorInfo.message);
              setIsInitialized(false);
              break;
            }
          }
        }
        
        // Set up periodic check for batched like notifications (every 5 minutes)
        batchCheckIntervalRef.current = setInterval(() => {
          checkAndSendBatchedLikeNotification(userId, sendNotificationInternal);
        }, 5 * 60 * 1000);
        
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
      if (batchCheckIntervalRef.current) {
        clearInterval(batchCheckIntervalRef.current);
      }
    };
  }, [userId, sendNotificationInternal]);

  const sendNotification = async (notification: NotificationPayload) => {
    try {
      const success = await sendPushNotification(notification);
      return success;
    } catch (err) {
      return false;
    }
  };

  /**
   * Send match notification - instant but respects suppression rules
   */
  const sendMatchNotification = async (
    matchedUserName: string, 
    targetUserId: string,
    currentTab?: string
  ) => {
    // Check if we should send
    if (!shouldSendMatchNotification(currentTab)) {
      return false;
    }

    const success = await sendNotification({
      title: "It's a Match! 🔥",
      body: `You and ${matchedUserName} liked each other. Say hello!`,
      userId: targetUserId,
      type: 'match',
      data: { matchedUserName }
    });

    if (success) {
      recordNotificationSent('match');
    }

    return success;
  };

  /**
   * Send message notification - always instant, only suppressed if in same chat
   */
  const sendMessageNotification = async (
    senderName: string, 
    message: string, 
    targetUserId: string, 
    chatId: string,
    currentChatId?: string
  ) => {
    // Check if we should send (suppress if user is in this chat)
    if (!shouldSendMessageNotification(currentChatId, chatId)) {
      return false;
    }

    const success = await sendNotification({
      title: senderName,
      body: message.length > 100 ? message.substring(0, 100) + '...' : message,
      userId: targetUserId,
      type: 'message',
      data: { senderName, chatId }
    });

    if (success) {
      recordNotificationSent('message');
    }

    return success;
  };

  /**
   * Queue a like event - batched notification system
   * Sends notification when: 3+ likes OR 2 hours since first unseen like
   * Respects: 2hr like cooldown, 2min global cooldown, activity suppression
   */
  const sendLikeNotification = async (likerName: string, targetUserId: string) => {
    // Queue the like event
    const { shouldNotify, likeCount } = queueLikeEvent();

    // If threshold reached, send notification
    if (shouldNotify && !isUserActive()) {
      const success = await sendNotification({
        title: 'Someone Likes You ✨',
        body: 'You caught someone\'s eye. Tap to see who\'s interested.',
        userId: targetUserId,
        type: 'like',
        data: { likeCount: likeCount.toString() }
      });

      if (success) {
        recordNotificationSent('like');
      }

      return success;
    }

    // Queued but not sent yet - this is expected behavior
    return true;
  };

  /**
   * Send batched like notification - call this to force check/send
   * Used when conditions are met (3 likes OR 2hr timeout)
   */
  const sendMultipleLikesNotification = async (targetUserId: string, likeCount: number) => {
    // Queue the like event instead of sending immediately
    const { shouldNotify, likeCount: currentCount } = queueLikeEvent();

    if (shouldNotify && !isUserActive()) {
      const success = await sendNotification({
        title: 'Someone Likes You ✨',
        body: 'You caught someone\'s eye. Tap to see who\'s interested.',
        userId: targetUserId,
        type: 'like',
        data: { likeCount: currentCount.toString() }
      });

      if (success) {
        recordNotificationSent('like');
      }

      return success;
    }

    return true;
  };

  /**
   * Send admin notification - respects global cooldown
   */
  const sendAdminNotification = async (title: string, message: string, targetUserId: string) => {
    // Check global cooldown for admin notifications
    if (!hasGlobalCooldownPassed()) {
      return false;
    }

    const success = await sendNotification({
      title,
      body: message,
      userId: targetUserId,
      type: 'admin'
    });

    if (success) {
      recordNotificationSent('other');
    }

    return success;
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

  /**
   * Get queued like count (for debugging/display)
   */
  const getQueuedLikeCount = (): number => {
    return getLikeQueueCount();
  };

  /**
   * Force check and send batched like notification
   */
  const flushLikeNotifications = async () => {
    if (!userId) return false;
    return checkAndSendBatchedLikeNotification(userId, sendNotificationInternal);
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
    refreshUnreadCount,
    recordUserActivity,
    getQueuedLikeCount,
    flushLikeNotifications
  };
};
