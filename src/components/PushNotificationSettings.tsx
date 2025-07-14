import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, BellOff, Smartphone, Globe } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { requestNotificationPermission } from '@/services/pushNotifications';

interface PushNotificationSettingsProps {
  currentUser: {
    id: string;
    email?: string;
  } | null;
}

const PushNotificationSettings = ({ currentUser }: PushNotificationSettingsProps) => {
  const {
    isInitialized,
    isSupported,
    deviceToken,
    error,
    unreadCount,
    sendMatchNotification,
    sendMessageNotification,
    sendLikeNotification,
    sendAdminNotification
  } = usePushNotifications(currentUser?.id);

  const [webPermission, setWebPermission] = useState<NotificationPermission | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const { toast } = useToast();

  // Check web notification permission
  useEffect(() => {
    if (!Capacitor.isNativePlatform() && 'Notification' in window) {
      setWebPermission(Notification.permission);
    }
  }, []);

  const platformInfo = Capacitor.isNativePlatform() 
    ? `Native (${Capacitor.getPlatform()})`
    : 'Web Browser';

  const hasWebSupport = !Capacitor.isNativePlatform() && isSupported && webPermission === 'granted';
  const hasNativeSupport = Capacitor.isNativePlatform() && isSupported;

  const requestWebPermission = async () => {
    if (!Capacitor.isNativePlatform()) {
      try {
        const granted = await requestNotificationPermission();
        setWebPermission(granted ? 'granted' : 'denied');
        if (granted) {
          setWebError(null);
          toast({
            title: "✅ Notifications Enabled",
            description: "You'll now receive push notifications in your browser.",
          });
        } else {
          setWebError('Permission denied by user');
        }
      } catch (err) {
        setWebError(err instanceof Error ? err.message : 'Unknown error');
      }
    }
  };

  const testNotifications = [
    {
      title: 'Test Match Notification',
      action: () => sendMatchNotification('Test User', currentUser?.id || ''),
      icon: '💕'
    },
    {
      title: 'Test Message Notification', 
      action: () => sendMessageNotification('Test User', 'Hey there! 👋', currentUser?.id || '', 'test-chat-123'),
      icon: '💬'
    },
    {
      title: 'Test Like Notification',
      action: () => sendLikeNotification('Test User', currentUser?.id || ''),
      icon: '❤️'
    },
    {
      title: 'Test Admin Notification',
      action: () => sendAdminNotification('Welcome!', 'Your profile has been approved.', currentUser?.id || ''),
      icon: '🔔'
    }
  ];

  const handleTestNotification = async (testFn: () => Promise<boolean>, title: string) => {
    try {
      await testFn();
      toast({
        title: '✅ Test Sent',
        description: `${title} sent successfully!`,
        variant: 'default'
      });
    } catch (error) {
      toast({
        title: '❌ Test Failed',
        description: `Failed to send ${title}`,
        variant: 'destructive'
      });
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              {Capacitor.isNativePlatform() ? <Smartphone className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
              <span className="font-medium">Platform</span>
            </div>
            <span className="text-sm text-gray-600">{platformInfo}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              <span className="font-medium">Push Notifications</span>
            </div>
            <div className={`px-2 py-1 rounded text-sm ${
              (hasNativeSupport || hasWebSupport) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {(hasNativeSupport || hasWebSupport) ? '✅ Available' : '❌ Not Available'}
            </div>
          </div>

          {Capacitor.isNativePlatform() && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                <span className="font-medium">Native Status</span>
              </div>
              <div className={`px-2 py-1 rounded text-sm ${
                isInitialized ? 'bg-green-100 text-green-800' : 
                error ? 'bg-red-100 text-red-800' : 
                'bg-yellow-100 text-yellow-800'
              }`}>
                {isInitialized ? '✅ Active' : error ? '❌ Error' : '⏳ Initializing'}
              </div>
            </div>
          )}

          {!Capacitor.isNativePlatform() && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span className="font-medium">Web Notifications</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`px-2 py-1 rounded text-sm ${
                  webPermission === 'granted' ? 'bg-green-100 text-green-800' : 
                  webPermission === 'denied' ? 'bg-red-100 text-red-800' : 
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {webPermission === 'granted' ? '✅ Enabled' : 
                   webPermission === 'denied' ? '❌ Denied' : '⏳ Not Requested'}
                </div>
                {webPermission !== 'granted' && (
                  <Button size="sm" onClick={requestWebPermission} variant="outline">
                    Enable
                  </Button>
                )}
              </div>
            </div>
          )}

          {deviceToken && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-800 mb-1">Native Device Token</div>
              <div className="text-xs text-blue-600 font-mono break-all">
                {deviceToken.substring(0, 32)}...
              </div>
            </div>
          )}

          {unreadCount > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-800 mb-1">Unread Notifications</div>
              <div className="text-xs text-blue-600">
                You have {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
              </div>
            </div>
          )}

          {(error || webError) && (
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="text-sm font-medium text-red-800 mb-1">Error</div>
              <div className="text-xs text-red-600">
                {error || webError}
                {!Capacitor.isNativePlatform() && webError && (
                  <div className="mt-2 text-xs">
                    💡 <strong>Need help?</strong> Check your browser notification settings
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Test Section */}
        {isSupported && isInitialized && (
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Test Notifications</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {testNotifications.map((test, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestNotification(test.action, test.title)}
                  className="justify-start gap-2"
                >
                  <span>{test.icon}</span>
                  {test.title}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Information Section */}
        <div className="space-y-2 text-sm text-gray-600">
          <h3 className="font-medium text-gray-900">About Push Notifications</h3>
          <ul className="space-y-1 list-disc list-inside">
            <li>Get notified about new matches and messages</li>
            <li>Receive likes and profile views alerts</li>
            <li>Admin announcements and important updates</li>
            <li>Works on mobile apps (iOS/Android)</li>
            <li>Limited functionality on web browsers</li>
          </ul>
        </div>

        {/* Platform Instructions */}
        {!isSupported && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <BellOff className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-800">Limited Web Support</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  For full push notification support, download our mobile app from the App Store or Google Play.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PushNotificationSettings;
