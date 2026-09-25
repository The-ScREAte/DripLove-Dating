import { supabase } from '@/integrations/supabase/client';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean>;
  userId?: string;
  type?: 'match' | 'message' | 'like' | 'system' | 'admin' | 'image_rejected';
}

interface RealtimeNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  related_user_id?: string | null;
  data?: unknown;
}

const normalizeNotificationData = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const nested = input.data;
  if (typeof nested === 'string') {
    try {
      const parsed = JSON.parse(nested);
      if (parsed && typeof parsed === 'object') return { ...input, ...(parsed as Record<string, unknown>) };
    } catch {
      // Keep the original native payload when a provider sends a plain string.
    }
  }
  return input;
};

// Where every notification tap/click goes - ONE table, used by the OS
// notification tap, the in-app toast click and (when the app is already
// running) MainApp's in-app navigation, so the three can never disagree.
//   message -> that exact conversation in Chat
//   match   -> the Chat list
//   like    -> Liked Me
//   image_rejected -> Profile
//   action open_circle_profile -> that person's profile inside Circle
//   anything else -> Discover, never Chat by default
export const resolveNotificationRoute = (
  type: string | undefined,
  data: Record<string, unknown> | undefined
): string => {
  if (data?.action === 'open_discover') return '/';
  if (data?.action === 'open_circle_profile' && data?.profileId) {
    return `/?tab=circle&circleUserId=${data.profileId}`;
  }
  if (type === 'message' && data?.chatId) return `/?tab=chat&matchId=${data.chatId}`;
  if (type === 'match') return '/?tab=chat';
  if (type === 'like') return '/?tab=liked';
  if (type === 'image_rejected') return '/?tab=profile';
  return '/';
};

// When the app is already running, MainApp registers a handler here so a tap
// switches tabs in place instead of hard-reloading the whole SPA (the reload
// was slow and raced with MainApp's own duplicate tap listener, which is why
// "Recommended for you" taps kept landing on Chat). Falls back to a real
// navigation when nothing is mounted to handle it.
export type NotificationNavHandler = (
  type: string | undefined,
  data: Record<string, unknown> | undefined
) => void;

let inAppNavHandler: NotificationNavHandler | null = null;
let pendingNavigation: { type?: string; data: Record<string, unknown> } | null = null;

export const setNotificationNavHandler = (handler: NotificationNavHandler | null): void => {
  inAppNavHandler = handler;
  if (handler && pendingNavigation) {
    const pending = pendingNavigation;
    pendingNavigation = null;
    handler(pending.type, pending.data);
  }
};

export const navigateFromNotification = (
  type: string | undefined,
  data: Record<string, unknown> | undefined
): void => {
  const normalized = normalizeNotificationData(data);
  const resolvedType = type || (typeof normalized.type === 'string' ? normalized.type : undefined);
  if (inAppNavHandler) {
    inAppNavHandler(resolvedType, normalized);
    return;
  }
  pendingNavigation = { type: resolvedType, data: normalized };
  const route = resolveNotificationRoute(resolvedType, normalized);
  if (route !== '/') window.history.replaceState({}, '', route);
};

// Dismiss only the notifications belonging to ONE conversation/thread, called
// when the user actually opens that conversation. Opening the app itself must
// never wipe the shade - unread notifications stay until they're tapped or
// cleared by the user.
export const clearThreadNotifications = async (threadKey: string): Promise<void> => {
  if (!threadKey || !Capacitor.isNativePlatform()) return;
  try {
    const delivered = await PushNotifications.getDeliveredNotifications();
    const matching = (delivered?.notifications || []).filter((n) => {
      const data = normalizeNotificationData(n.data);
      if (data.threadKey === threadKey) return true;
      const chatId = typeof data.chatId === 'string' ? data.chatId : undefined;
      return !!chatId && `chat-${chatId}` === threadKey;
    });
    if (matching.length > 0) {
      await PushNotifications.removeDeliveredNotifications({ notifications: matching });
    }
  } catch {
    // A failure here just leaves the notification in the shade - never fatal.
  }
};


class SupabasePushNotificationService {
  private isInitialized = false;
  // MainApp and whichever tab mounts alongside it (DiscoverPage, ChatPage,
  // etc - all six call usePushNotifications independently) call initialize()
  // in the same render. Without caching the in-flight promise, each call saw
  // isInitialized still false and independently ran
  // initializeNativePushNotifications, which registers native listeners with
  // no dedup of its own - so a single real push fired
  // handleNotificationAction/handleForegroundNotification once per
  // concurrent caller (duplicate in-app toast on a foreground push).
  private initPromise: Promise<boolean> | null = null;
  private deviceToken: string | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private currentUserId: string | null = null;
  private static readonly PERMISSION_DENIAL_KEY = 'notification_permission_last_denied';
  private static readonly RETRY_DELAY_DAYS = 3;

  private shouldRequestPermission(): boolean {
    // Check if permission was denied recently
    const lastDeniedStr = localStorage.getItem(SupabasePushNotificationService.PERMISSION_DENIAL_KEY);
    if (!lastDeniedStr) {
      return true; // First time, should request
    }

    try {
      const lastDenied = new Date(lastDeniedStr);
      const daysSinceDenial = (Date.now() - lastDenied.getTime()) / (1000 * 60 * 60 * 24);
      
      // Request again if it's been more than 3 days
      return daysSinceDenial >= SupabasePushNotificationService.RETRY_DELAY_DAYS;
    } catch (e) {
      // If there's an error parsing the date, request permission
      return true;
    }
  }

  private recordPermissionDenial(): void {
    localStorage.setItem(
      SupabasePushNotificationService.PERMISSION_DENIAL_KEY,
      new Date().toISOString()
    );
  }

  private clearPermissionDenial(): void {
    localStorage.removeItem(SupabasePushNotificationService.PERMISSION_DENIAL_KEY);
  }

  async initialize(userId: string): Promise<boolean> {
    if (this.isInitialized) return true;
    // See initPromise's declaration above: this makes concurrent callers
    // within the same render await the one real initialization instead of
    // each independently registering their own native listeners.
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize(userId);
    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(userId: string): Promise<boolean> {
    try {
      this.currentUserId = userId;

      // Prevent Firebase messaging initialization in Capacitor WebView
      if (typeof window !== 'undefined') {
        // Block Firebase messaging APIs in WebView environments
        if ((window as any).firebase && !Capacitor.isNativePlatform()) {
          return true;
        }
      }

      // Initialize native push notifications if on mobile
      if (Capacitor.isNativePlatform()) {
        await this.initializeNativePushNotifications(userId);
      }

      // Initialize Supabase Realtime for web notifications
      await this.initializeRealtimeNotifications(userId);

      this.isInitialized = true;
      return true;

    } catch (error) {
      // Silent error handling
      return false;
    }
  }

  private async initializeNativePushNotifications(userId: string): Promise<void> {
    try {
      // Ensure we're on a native platform and push notifications are available
      if (!Capacitor.isNativePlatform() || typeof PushNotifications === 'undefined') {
        return;
      }

      // Tap/foreground listeners must exist even when permission was denied
      // recently; already-delivered notifications can still launch the app.
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        this.handleForegroundNotification(notification);
      });
      PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
        this.handleNotificationAction(notification);
      });

      // Check if we should request permission (respects 3-day delay)
      if (!this.shouldRequestPermission()) {
        // Too soon since last denial, skip request
        return;
      }

      // Add delay to ensure Firebase is fully initialized (especially on iOS)
      const delay = Capacitor.getPlatform() === 'ios' ? 2000 : 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      // Request permission for push notifications
      const permissionStatus = await PushNotifications.requestPermissions();
      
      if (permissionStatus.receive === 'granted') {
        // Permission granted! Clear any denial record
        this.clearPermissionDenial();

        // Add delay to ensure Firebase is fully initialized on Android
        if (Capacitor.getPlatform() === 'android') {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Register for push notifications with error handling
        try {
          await PushNotifications.register();
        } catch (registerError) {
          console.error('❌ Failed to register for push notifications:', registerError);
          // Continue without push notifications rather than failing completely
          return;
        }
        
        // Set up event listeners
        PushNotifications.addListener('registration', async (token: Token) => {
          // For iOS, get FCM token from Firebase Messaging plugin
          if (Capacitor.getPlatform() === 'ios') {
            try {
              const { token: fcmToken } = await FirebaseMessaging.getToken();
              this.deviceToken = fcmToken;
              await this.saveTokenToDatabase(userId, fcmToken, 'ios');
            } catch (error) {
              console.error('❌ Failed to get FCM token for iOS:', error);
              // Fallback to APNs token (won't work with FCM but better than nothing)
              this.deviceToken = token.value;
              await this.saveTokenToDatabase(userId, token.value, 'ios');
            }
          } else {
            // Android uses token.value directly (it's already an FCM token)
            this.deviceToken = token.value;
            await this.saveTokenToDatabase(userId, token.value, Capacitor.getPlatform());
          }
        });

        PushNotifications.addListener('registrationError', (error: unknown) => {
          console.error('❌ Push notification registration error:', error);
          // Don't throw - let the app continue without push notifications
        });

      } else if (permissionStatus.receive === 'denied') {
        // Permission denied, record timestamp for 3-day retry
        this.recordPermissionDenial();
      }
      // If permission is 'prompt', don't record as denied
    } catch (error) {
      console.error('❌ Error in initializeNativePushNotifications:', error);
      // Continue silently if push notifications fail
    }
  }

  private async initializeRealtimeNotifications(userId: string): Promise<void> {
    // Subscribe to real-time notifications for this user
    this.realtimeChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          this.handleRealtimeNotification(payload.new as RealtimeNotification);
        }
      )
      .subscribe();
  }

  private async saveTokenToDatabase(userId: string, token: string, platform?: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('push_tokens')
        .upsert({
          user_id: userId,
          token,
          platform: platform || Capacitor.getPlatform(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,platform'
        });

      if (error) {
        // Silent error handling
      }
    } catch (error) {
      // Silent error handling
    }
  }

  private handleRealtimeNotification(notification: RealtimeNotification): void {
    // Likes already get the real push notification (sendLikeNotification /
    // sendMultipleLikesNotification) - skip the extra custom in-app popup
    // banner for them so a like doesn't show up twice.
    if (notification.type !== 'like') {
      this.showInAppNotification({
        title: notification.title,
        body: notification.message,
        data: { notificationId: notification.id, ...normalizeNotificationData(notification.data) },
        type: notification.type as 'match' | 'message' | 'like' | 'system' | 'admin'
      });
    }

    // If on web and browser supports notifications, show browser notification
    // (this is the actual push-equivalent on web, so likes still surface here).
    if (!Capacitor.isNativePlatform() && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        data: { notificationId: notification.id, type: notification.type }
      });
    }
  }

  private handleForegroundNotification(notification: PushNotificationSchema): void {
    // Same rule as the realtime path: a like already arrived as the real push
    // notification, so don't also pop the custom in-app banner for it.
    if (notification.data?.type === 'like') return;
    this.showInAppNotification({
      title: notification.title,
      body: notification.body,
      data: notification.data
    });
  }

  // Single source of truth for "where does tapping/clicking this
  // notification go" - the shared module-level resolveNotificationRoute /
  // navigateFromNotification at the top of this file, used by the OS
  // notification tap (handleNotificationAction, below), the in-app toast's
  // own click handler, and MainApp's in-app tab navigation alike.
  private handleNotificationAction(notification: ActionPerformed): void {
    const data = normalizeNotificationData(notification.notification.data);
    navigateFromNotification(data?.type as string | undefined, data);
  }

  private showInAppNotification(payload: NotificationPayload): void {
    // Compact, native-notification-style card (small, dark, title + body
    // only) instead of the previous full-width bright-purple "flash" banner
    // with a raw "• type" debug footer.
    const toast = document.createElement('div');
    toast.className = 'fixed top-3 inset-x-3 sm:left-auto sm:right-3 sm:w-80 bg-neutral-900/95 text-white rounded-xl shadow-lg border border-white/10 z-50 cursor-pointer transition-all';
    toast.style.transform = 'translateY(0)';
    toast.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

    // Built via DOM nodes (not innerHTML) so a title/body containing another
    // user's display name or message text can never be interpreted as HTML.
    const content = document.createElement('div');
    content.className = 'flex items-start gap-2.5 px-3 py-2.5';

    const dot = document.createElement('div');
    dot.className = 'mt-1 w-2 h-2 rounded-full bg-pink-500 shrink-0';
    content.appendChild(dot);

    const text = document.createElement('div');
    text.className = 'min-w-0 flex-1';

    const titleEl = document.createElement('div');
    titleEl.className = 'text-[13px] font-semibold leading-tight truncate';
    titleEl.textContent = payload.title;
    text.appendChild(titleEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'text-[12px] text-white/70 leading-snug mt-0.5 line-clamp-2';
    bodyEl.textContent = payload.body;
    text.appendChild(bodyEl);

    content.appendChild(text);
    toast.appendChild(content);

    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    const timeout = setTimeout(() => {
      this.removeToast(toast);
    }, 5000);

    // Add swipe gesture support
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = false;
      toast.style.transition = 'none'; // Disable transition during swipe
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!startX) return;
      
      currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      
      // Only allow horizontal swipes (prevent vertical scroll interference)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isSwiping = true;
        e.preventDefault();
        
        // Allow swipe right or up to dismiss
        if (deltaX > 0 || deltaY < -10) {
          toast.style.transform = `translateX(${deltaX}px) translateY(${Math.min(0, deltaY)}px)`;
          toast.style.opacity = String(Math.max(0, 1 - Math.abs(deltaX) / 200));
        }
      }
    };

    const handleTouchEnd = () => {
      const deltaX = currentX - startX;
      
      toast.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
      
      // If swiped more than 100px or with velocity, dismiss
      if (Math.abs(deltaX) > 100) {
        clearTimeout(timeout);
        toast.style.transform = `translateX(${deltaX > 0 ? '400px' : '-400px'})`;
        toast.style.opacity = '0';
        setTimeout(() => this.removeToast(toast), 300);
      } else {
        // Return to original position
        toast.style.transform = 'translateX(0) translateY(0)';
        toast.style.opacity = '1';
      }
      
      startX = 0;
      currentX = 0;
    };

    // Add touch event listeners for swipe
    toast.addEventListener('touchstart', handleTouchStart, { passive: false });
    toast.addEventListener('touchmove', handleTouchMove, { passive: false });
    toast.addEventListener('touchend', handleTouchEnd);

    // Add click handler to dismiss and potentially navigate
    toast.addEventListener('click', () => {
      if (isSwiping) return; // Don't navigate if user was swiping

      clearTimeout(timeout);
      this.removeToast(toast);

      // A native foreground push's own `type` lives inside payload.data.type
      // (that's how the FCM data payload is shaped), not payload.type - only
      // the realtime/web path sets payload.type directly. Checking both here
      // is what makes match/like taps on this toast actually navigate.
      const type = payload.type || (payload.data?.type as string | undefined);
      navigateFromNotification(type, payload.data);
    });
  }

  private removeToast(toast: HTMLElement): void {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      // Call Supabase Edge Function to send push notification
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: payload.title,
          body: payload.body,
          userId: payload.userId,
          type: payload.type || 'system',
          data: payload.data || {}
        }
      });

      if (error) {
        console.error('📤 Notification error:', error);
        // Don't return false immediately - the notification might still be stored for real-time
      }

      // Check if notification was processed successfully (either via push or real-time)
      const success = data?.success || data?.realTimeStored;
      
      if (success) {
        return true;
      } else {
        console.error('❌ Notification failed:', data);
        return false;
      }

    } catch (error) {
      console.error('📤 Notification exception:', error);
      // Silent error handling
      // Even if push fails, real-time notifications should still work
      return false;
    }
  }

  async requestWebNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      this.clearPermissionDenial();
      return true;
    }

    if (Notification.permission === 'denied') {
      // Already denied, don't retry
      return false;
    }

    // Check if we should request (respects 3-day delay)
    if (!this.shouldRequestPermission()) {
      return false;
    }

    // Permission is 'default', request it
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      this.clearPermissionDenial();
      return true;
    } else if (permission === 'denied') {
      this.recordPermissionDenial();
      return false;
    }

    return false;
  }

  async markNotificationAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) {
        // Silent error handling
        return false;
      }

      return true;
    } catch (error) {
      // Silent error handling
      return false;
    }
  }

  async getUnreadNotifications(userId: string): Promise<RealtimeNotification[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) {
        // Silent error handling
        return [];
      }

      return data || [];
    } catch (error) {
      // Silent error handling
      return [];
    }
  }

  async removeToken(userId: string): Promise<void> {
    if (!userId) {
      console.warn('⚠️ Cannot remove push token: userId is missing');
      return;
    }

    const platform = Capacitor.getPlatform();

    // Retry once on failure instead of silently giving up - a logout that
    // "succeeds" on screen but leaves the token in the DB means this device
    // keeps getting push notifications for an account nobody's using here
    // anymore. .select() forces Postgrest to return the deleted rows so a
    // false-positive "no error, but nothing actually matched" case (RLS
    // silently filtering, wrong platform value, etc.) is also caught.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase
          .from('push_tokens')
          .delete()
          .eq('user_id', userId)
          .eq('platform', platform)
          .select('id');

        if (!error) {
          if (!data || data.length === 0) {
            console.warn(`⚠️ removeToken: delete matched 0 rows for user ${userId} (${platform}) on attempt ${attempt} - token may already be gone, or was never saved under this platform`);
          }
          this.deviceToken = null;
          return;
        }

        console.error(`❌ removeToken: delete failed on attempt ${attempt} for user ${userId} (${platform}):`, error);
      } catch (error) {
        console.error(`❌ removeToken: unexpected error on attempt ${attempt} for user ${userId} (${platform}):`, error);
      }
    }

    // Still failed after a retry - the caller (logout flow) doesn't block on
    // this, but it needs to be visible somewhere instead of vanishing.
    console.error(`❌ removeToken: giving up after 2 attempts - push_tokens row for user ${userId} (${platform}) was NOT removed. This device will keep receiving push notifications for this account.`);
    this.deviceToken = null;
  }

  cleanup(): void {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    
    if (Capacitor.isNativePlatform()) {
      PushNotifications.removeAllListeners();
    }
    
    this.isInitialized = false;
    this.currentUserId = null;
  }
}

// Create singleton instance
export const pushNotificationService = new SupabasePushNotificationService();

// Export convenience functions
export const initializePushNotifications = (userId: string) => pushNotificationService.initialize(userId);
export const sendPushNotification = (payload: NotificationPayload) => pushNotificationService.sendNotification(payload);
export const requestNotificationPermission = () => pushNotificationService.requestWebNotificationPermission();
export const markNotificationRead = (notificationId: string) => pushNotificationService.markNotificationAsRead(notificationId);
export const getUnreadNotifications = (userId: string) => pushNotificationService.getUnreadNotifications(userId);
export const removePushToken = (userId: string) => pushNotificationService.removeToken(userId);
export const cleanupPushNotifications = () => pushNotificationService.cleanup();
