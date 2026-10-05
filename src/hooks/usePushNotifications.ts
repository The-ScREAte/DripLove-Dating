import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
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
  recordNotificationSent,
  shouldSendMessageNotification,
  recordUserActivity,
  hasGlobalCooldownPassed,
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

  useEffect(() => {
    const initializePushNotificationsAsync = async () => {
      if (!userId) return;

      try {
        // Native push (Capacitor's own plugin, via initializePushNotifications
        // below) has nothing to do with the web Notification API - WKWebView
        // and Android's WebView both lack window.Notification, so gating
        // initialization on it here meant initializeNativePushNotifications
        // (which registers the pushNotificationActionPerformed TAP listener -
        // see pushNotifications.ts) never ran on a real device. MainApp has
        // its own separate, ungated effect that registers a device token, so
        // tokens existing in the database was never actually evidence this
        // gate was passing - it's a second, independent code path that
        // deliberately does NOT register the tap listener (see its own
        // comment: "do not re-add it"). That gap is exactly why a tap could
        // deliver the push to the device (token path worked) while doing
        // nothing when tapped (listener path never ran).
        const nativeSupported = Capacitor.isNativePlatform();
        const webSupported = 'Notification' in window;
        const supported = nativeSupported || webSupported;
        setIsSupported(supported);

        if (!supported) {
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

  /**
   * Matches are announced by the server the moment they're created (database
   * trigger notify_match_created -> send-push-notification, with an email
   * when the person can't get pushes). This used to send from the phone of
   * whoever completed the match and skipped it if they'd swiped in the last
   * minute - i.e. almost always - so it's now a no-op kept for callers.
   */
  const sendMatchNotification = async (
    _matchedUserName: string,
    _targetUserId: string,
    _currentTab?: string
  ) => true;

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

    const preview = message.length > 80 ? message.substring(0, 80) + '...' : message;
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
   * Likes are announced by the server the moment they're saved (database
   * trigger notify_like_received -> send-push-notification, with an email
   * when the person can't get pushes). This used to be decided on the
   * LIKER's phone - after the liker had liked 3 people or 2 hours, and only
   * if the liker wasn't using the app - so most likes were never announced.
   * Now a no-op kept for callers.
   */
  const sendMultipleLikesNotification = async (_targetUserId: string, _likeCount: number, _likerId?: string) => true;

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

  // Likes are no longer batched on the phone (see sendMultipleLikesNotification).
  const getQueuedLikeCount = (): number => 0;
  const flushLikeNotifications = async () => false;

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
