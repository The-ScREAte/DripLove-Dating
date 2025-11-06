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
  type?: 'match' | 'message' | 'like' | 'system' | 'admin';
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
}

class SupabasePushNotificationService {
  private isInitialized = false;
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
          // Continue without push notifications rather than failing completely
          return;
        }
        
        // Set up event listeners
        PushNotifications.addListener('registration', async (token: Token) => {
          // For iOS, get FCM token from Firebase Messaging plugin
          if (Capacitor.getPlatform() === 'ios') {
            try {
              const { token: fcmToken } = await FirebaseMessaging.getToken();
              console.log('📱 Got FCM token for iOS:', fcmToken.substring(0, 20) + '...');
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
          // Don't throw - let the app continue without push notifications
        });

        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
          this.handleForegroundNotification(notification);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
          this.handleNotificationAction(notification);
        });
      } else if (permissionStatus.receive === 'denied') {
        // Permission denied, record timestamp for 3-day retry
        this.recordPermissionDenial();
      }
      // If permission is 'prompt', don't record as denied
    } catch (error) {
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
    // Show in-app notification
    this.showInAppNotification({
      title: notification.title,
      body: notification.message,
      data: { notificationId: notification.id },
      type: notification.type as 'match' | 'message' | 'like' | 'system' | 'admin'
    });

    // If on web and browser supports notifications, show browser notification
    if (!Capacitor.isNativePlatform() && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        data: { notificationId: notification.id, type: notification.type }
      });
    }
  }

  private handleForegroundNotification(notification: PushNotificationSchema): void {
    this.showInAppNotification({
      title: notification.title,
      body: notification.body,
      data: notification.data
    });
  }

  private handleNotificationAction(notification: ActionPerformed): void {
    // Handle notification tap/action
    const data = notification.notification.data;
    console.log('🔔 Notification tapped, data:', data);
    
    // Check for specific action first
    if (data?.action === 'open_discover') {
      console.log('🎯 Opening discover page from broadcast notification');
      window.location.href = '/discover';
      return;
    }
    
    if (data?.type === 'message' && data?.chatId) {
      // Navigate to specific chat conversation
      console.log('💬 Opening chat:', data.chatId);
      window.location.href = `/chat?matchId=${data.chatId}`;
      return;
    }
    
    if (data?.type === 'match') {
      // Navigate to chat page (matches tab) 
      console.log('🎉 Opening matches/chat page');
      window.location.href = '/chat';
      return;
    }
    
    if (data?.type === 'like') {
      // Navigate to liked me page
      console.log('💖 Opening likes page');
      window.location.href = '/liked-me';
      return;
    }
    
    if (data?.type === 'system' || data?.type === 'admin') {
      // System/admin notifications go to discover page
      console.log('📢 Opening discover page from system notification');
      window.location.href = '/discover';
      return;
    }
    
    // Default: go to chat page
    console.log('📱 Opening default chat page');
    window.location.href = '/chat';
  }

  private showInAppNotification(payload: NotificationPayload): void {
    // Create and show in-app notification toast
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm cursor-pointer transition-all hover:bg-purple-700';
    toast.innerHTML = `
      <div class="font-semibold">${payload.title}</div>
      <div class="text-sm opacity-90">${payload.body}</div>
      <div class="text-xs opacity-70 mt-1">${payload.type ? `• ${payload.type}` : ''}</div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    const timeout = setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);

    // Add click handler to dismiss and potentially navigate
    toast.addEventListener('click', () => {
      clearTimeout(timeout);
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      
      // Handle navigation based on notification type
      if (payload.data?.chatId) {
        window.location.href = `/chat/${payload.data.chatId}`;
      } else if (payload.type === 'match') {
        window.location.href = '/matches';
      } else if (payload.type === 'like') {
        window.location.href = '/likes';
      }
    });
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      console.log('📤 Sending notification:', payload);
      
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

      console.log('📤 Notification response:', data);
      
      // Check if notification was processed successfully (either via push or real-time)
      const success = data?.success || data?.realTimeStored;
      
      if (success) {
        console.log('✅ Notification sent successfully');
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
    try {
      // Get the current device token before removing
      const platform = Capacitor.getPlatform();
      
      // Delete the push token for this user and device from the database
      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('platform', platform);

      if (error) {
        console.error('❌ Failed to remove push token:', error);
      } else {
        console.log('✅ Push token removed for user:', userId, 'platform:', platform);
      }
      
      // Clear the stored device token
      this.deviceToken = null;
    } catch (error) {
      console.error('❌ Error removing push token:', error);
    }
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
