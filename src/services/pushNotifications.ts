import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { initializeFirebase, getFirebaseToken, setupFirebaseMessageListener } from '@/config/firebase';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean>;
  userId?: string;
  type?: 'match' | 'message' | 'like' | 'system' | 'admin';
}

class PushNotificationService {
  private isInitialized = false;
  private deviceToken: string | null = null;
  private firebaseToken: string | null = null;

  async initialize(userId: string): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      console.log('🔔 Initializing push notifications...');

      // Initialize Firebase for web notifications
      if (!Capacitor.isNativePlatform()) {
        console.log('🌐 Initializing Firebase for web notifications...');
        await initializeFirebase();
        
        // Get Firebase token for web
        this.firebaseToken = await getFirebaseToken();
        if (this.firebaseToken) {
          await this.saveTokenToDatabase(userId, this.firebaseToken, 'firebase');
          console.log('✅ Firebase token registered for web');
        }

        // Setup Firebase message listener for foreground messages
        setupFirebaseMessageListener((payload) => {
          console.log('📨 Firebase message received:', payload);
          this.handleFirebaseMessage(payload);
        });

        this.isInitialized = true;
        return true;
      }

      // Native platform initialization
      console.log('� Initializing native push notifications...');

      // Request permission for push notifications
      const permission = await PushNotifications.requestPermissions();
      
      if (permission.receive !== 'granted') {
        console.log('❌ Push notification permission not granted');
        return false;
      }

      // Register for push notifications
      await PushNotifications.register();

      // Listen for registration token
      PushNotifications.addListener('registration', async (token: Token) => {
        console.log('📝 Push registration successful, token:', token.value);
        this.deviceToken = token.value;
        await this.saveTokenToDatabase(userId, token.value, 'native');
      });

      // Listen for registration errors
      PushNotifications.addListener('registrationError', (error: { error: string }) => {
        console.error('❌ Push registration failed:', error);
      });

      // Listen for push notifications received while app is in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('📨 Push notification received in foreground:', notification);
        this.handleForegroundNotification(notification);
      });

      // Listen for push notification actions (when user taps notification)
      PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        console.log('👆 Push notification action performed:', action);
        this.handleNotificationAction(action);
      });

      this.isInitialized = true;
      console.log('✅ Push notifications initialized successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize push notifications:', error);
      return false;
    }
  }

  private async saveTokenToDatabase(userId: string, token: string, platform?: string): Promise<void> {
    try {
      // TODO: Apply migration first (supabase/migrations/20250714_add_push_tokens.sql)
      // Then uncomment this block:
      /*
      const { error } = await supabase
        .from('push_tokens')
        .upsert({
          user_id: userId,
          token,
          platform: platform || Capacitor.getPlatform(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('❌ Failed to save push token:', error);
      } else {
        console.log('✅ Push token saved to database');
      }
      */
      
      console.log('📝 Push token ready to save (apply migration first):', { 
        userId, 
        token: `${token.substring(0, 10)}...`, // Truncate for privacy
        platform: platform || Capacitor.getPlatform() 
      });
    } catch (error) {
      console.error('❌ Error saving push token:', error);
    }
  }

  private handleFirebaseMessage(payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }): void {
    // Show in-app notification for Firebase messages
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
    toast.innerHTML = `
      <div class="font-semibold">${payload.notification?.title || 'New notification'}</div>
      <div class="text-sm opacity-90">${payload.notification?.body || ''}</div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);

    // Add click handler to dismiss
    toast.addEventListener('click', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }

  private handleForegroundNotification(notification: PushNotificationSchema): void {
    // Show in-app notification when app is in foreground
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
    toast.innerHTML = `
      <div class="font-semibold">${notification.title}</div>
      <div class="text-sm opacity-90">${notification.body}</div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);

    // Add click handler to dismiss
    toast.addEventListener('click', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }

  private handleNotificationAction(action: ActionPerformed): void {
    const data = action.notification.data;
    
    // Handle different notification types
    switch (data?.type) {
      case 'match':
        // Navigate to matches page
        window.location.hash = '/matches';
        break;
      case 'message':
        // Navigate to chat with specific user
        if (data.chatId) {
          window.location.hash = `/chat/${data.chatId}`;
        }
        break;
      case 'like':
        // Navigate to liked me page
        window.location.hash = '/liked-me';
        break;
      case 'admin':
        // Navigate to admin notifications
        window.location.hash = '/admin';
        break;
      default:
        // Navigate to main app
        window.location.hash = '/dashboard';
    }
  }

  async sendNotification(notification: NotificationPayload): Promise<boolean> {
    try {
      console.log('📤 Sending push notification:', notification);

      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: notification
      });

      if (error) {
        console.error('❌ Failed to send push notification:', error);
        return false;
      }

      console.log('✅ Push notification sent successfully');
      return true;
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
      return false;
    }
  }

  async sendMatchNotification(matchedUserId: string, currentUserName: string): Promise<void> {
    await this.sendNotification({
      title: '💕 New Match!',
      body: `You matched with ${currentUserName}! Start chatting now.`,
      userId: matchedUserId,
      type: 'match',
      data: {
        type: 'match',
        fromUser: currentUserName
      }
    });
  }

  async sendMessageNotification(recipientId: string, senderName: string, messagePreview: string): Promise<void> {
    await this.sendNotification({
      title: `💬 ${senderName}`,
      body: messagePreview,
      userId: recipientId,
      type: 'message',
      data: {
        type: 'message',
        sender: senderName
      }
    });
  }

  async sendLikeNotification(likedUserId: string, likerName: string): Promise<void> {
    await this.sendNotification({
      title: '❤️ Someone likes you!',
      body: `${likerName} liked your profile. Check it out!`,
      userId: likedUserId,
      type: 'like',
      data: {
        type: 'like',
        fromUser: likerName
      }
    });
  }

  async sendAdminNotification(userId: string, title: string, message: string): Promise<void> {
    await this.sendNotification({
      title: `🔔 ${title}`,
      body: message,
      userId,
      type: 'admin',
      data: {
        type: 'admin'
      }
    });
  }

  async unregister(): Promise<void> {
    try {
      await PushNotifications.removeAllListeners();
      this.isInitialized = false;
      this.deviceToken = null;
      console.log('✅ Push notifications unregistered');
    } catch (error) {
      console.error('❌ Failed to unregister push notifications:', error);
    }
  }

  getDeviceToken(): string | null {
    return this.deviceToken;
  }

  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }
}

export const pushNotificationService = new PushNotificationService();
