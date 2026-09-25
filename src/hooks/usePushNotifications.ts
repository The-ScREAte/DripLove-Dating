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

// cleanupPushNotifications() is a GLOBAL teardown - it calls
// PushNotifications.removeAllListeners(), which kills the native
// `pushNotificationActionPerformed` (tap) listener for the entire app, and
// drops the realtime channel. Seven components call this hook (MainApp plus
// every tab page and two admin screens), so having each one run that
// teardown on its own unmount meant a single tab unmounting silently left
// the app with ZERO tap listeners - the components still mounted never
// re-register, since their effects don't re-run. Tapping a notification then
// did nothing at all: the app just resumed on whatever tab was already open.
// Counting live consumers and only tearing down when the last one goes keeps
// the listeners alive for as long as anything still needs them.
let activePushConsumers = 0;

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

    activePushConsumers += 1;
    initializePushNotificationsAsync();

    // Cleanup on unmount
    return () => {
      activePushConsumers = Math.max(0, activePushConsumers - 1);
      // Only the last consumer standing tears down the shared listeners -
      // see activePushConsumers above.
      if (activePushConsumers === 0) {
        cleanupPushNotifications();
      }
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
      title: "It's a match",
      body: `You and ${matchedUserName} caught each other's eye. Say hello!`,
      userId: targetUserId,
      type: 'match',
      // senderId lets the edge function resolve this device's own photo
      // server-side, once, for the recipient's notification avatar.
      data: { matchedUserName, senderId: userId }
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

    const preview = message.length > 100 ? message.substring(0, 100) + '...' : message;
    const success = await sendNotification({
      title: senderName,
      body: preview,
      userId: targetUserId,
      type: 'message',
      // senderId lets the edge function resolve this device's own photo
      // server-side, once, for the recipient's notification avatar.
      data: { senderName, chatId, senderId: userId }
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
  /**
   * Send batched like notification - call this to force check/send
   * Used when conditions are met (3 likes OR 2hr timeout)
   */
  const sendMultipleLikesNotification = async (targetUserId: string, likeCount: number, likerId?: string) => {
    // Queue the like event instead of sending immediately
    const { shouldNotify, likeCount: currentCount } = queueLikeEvent();

    if (shouldNotify && !isUserActive()) {
      const success = await sendNotification({
        title: 'New interest in your profile',
        body: "You're catching some eyes. See who's interested!",
        userId: targetUserId,
        type: 'like',
        // senderId (the most recent liker) lets the edge function resolve
        // their photo server-side for the notification avatar.
        data: { likeCount: currentCount.toString(), senderId: likerId }
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
    sendMultipleLikesNotification,
    sendAdminNotification,
    markAsRead,
    refreshUnreadCount,
    recordUserActivity,
    getQueuedLikeCount,
    flushLikeNotifications
  };
};
