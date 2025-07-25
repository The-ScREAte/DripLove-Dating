import { supabase } from '@/integrations/supabase/client';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
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

  async initialize(userId: string): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      this.currentUserId = userId;

      // Prevent Firebase messaging initialization in Capacitor WebView
      if (typeof window !== 'undefined') {
        // Block Firebase messaging APIs in WebView environments
        if ((window as any).firebase && !Capacitor.isNativePlatform()) {
          console.warn('⚠️ Blocking Firebase messaging in WebView environment');
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
      console.error('❌ Error initializing push notifications:', error);
      return false;
    }
  }

  private async initializeNativePushNotifications(userId: string): Promise<void> {
    try {
      console.log('🔄 Attempting to initialize native push notifications...');
      
      // Ensure we're on a native platform and push notifications are available
      if (!Capacitor.isNativePlatform() || typeof PushNotifications === 'undefined') {
        console.warn('⚠️ Push notifications not available on this platform');
        return;
      }

      // Add a small delay to ensure Firebase is initialized
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Request permission for push notifications
      const permissionStatus = await PushNotifications.requestPermissions();
      console.log('📱 Push permissions result:', permissionStatus);
      
      if (permissionStatus.receive === 'granted') {
        console.log('📱 Push permissions granted, attempting registration...');
        
        // Register for push notifications with error handling
        try {
          await PushNotifications.register();
          console.log('📱 Push registration initiated successfully');
        } catch (registerError) {
          console.error('❌ Failed to register for push notifications:', registerError);
          // Continue without push notifications rather than failing completely
          return;
        }
        
        // Set up event listeners
        PushNotifications.addListener('registration', async (token: Token) => {
          console.log('✅ Push registration success, token received:', token.value);
          this.deviceToken = token.value;
          await this.saveTokenToDatabase(userId, token.value, Capacitor.getPlatform());
        });

        PushNotifications.addListener('registrationError', (error: unknown) => {
          console.error('❌ Error registering for push notifications:', error);
          // Don't throw - let the app continue without push notifications
        });

        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
          console.log('📬 Push notification received:', notification);
          this.handleForegroundNotification(notification);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
          this.handleNotificationAction(notification);
        });
      }
    } catch (error) {
      console.error('❌ Error initializing native push notifications:', error);
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
        console.error('❌ Failed to save push token:', error);
      }
    } catch (error) {
      console.error('❌ Error saving push token:', error);
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
    if (data?.type === 'message') {
      // Navigate to chat
      window.location.href = `/chat/${data.chatId}`;
    } else if (data?.type === 'match') {
      // Navigate to matches
      window.location.href = '/matches';
    } else if (data?.type === 'like') {
      // Navigate to likes
      window.location.href = '/likes';
    }
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
        return false;
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  async requestWebNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('⚠️ Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
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
        console.error('❌ Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
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
        console.error('❌ Error fetching unread notifications:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching unread notifications:', error);
      return [];
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
export const cleanupPushNotifications = () => pushNotificationService.cleanup();
