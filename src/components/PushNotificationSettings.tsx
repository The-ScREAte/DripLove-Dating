import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, BellOff, Smartphone, Globe } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { getFirebaseToken } from '@/config/firebase';

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
    sendMatchNotification,
    sendMessageNotification,
    sendLikeNotification,
    sendAdminNotification
  } = usePushNotifications(currentUser?.id);

  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const { toast } = useToast();

  // Check Firebase token on web
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      getFirebaseToken()
        .then(token => {
          setFirebaseToken(token);
          if (!token) {
            setFirebaseError('Firebase not configured or permission denied');
          }
        })
        .catch(err => {
          setFirebaseError(err.message);
        });
    }
  }, []);

  const platformInfo = Capacitor.isNativePlatform() 
    ? `Native (${Capacitor.getPlatform()})`
    : 'Web Browser';

  const hasFirebaseSupport = !Capacitor.isNativePlatform() && firebaseToken;
  const hasNativeSupport = Capacitor.isNativePlatform() && isSupported;

  const testNotifications = [
    {
      title: 'Test Match Notification',
      action: () => sendMatchNotification(currentUser?.id || '', 'Test User'),
      icon: '💕'
    },
    {
      title: 'Test Message Notification', 
      action: () => sendMessageNotification(currentUser?.id || '', 'Test User', 'Hey there! 👋'),
      icon: '💬'
    },
    {
      title: 'Test Like Notification',
      action: () => sendLikeNotification(currentUser?.id || '', 'Test User'),
      icon: '❤️'
    },
    {
      title: 'Test Admin Notification',
      action: () => sendAdminNotification(currentUser?.id || '', 'Welcome!', 'Your profile has been approved.'),
      icon: '🔔'
    }
  ];

  const handleTestNotification = async (testFn: () => Promise<void>, title: string) => {
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
              (hasNativeSupport || hasFirebaseSupport) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {(hasNativeSupport || hasFirebaseSupport) ? '✅ Available' : '❌ Not Available'}
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
                <span className="font-medium">Firebase Status</span>
              </div>
              <div className={`px-2 py-1 rounded text-sm ${
                firebaseToken ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {firebaseToken ? '✅ Ready' : '❌ Not Configured'}
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

          {firebaseToken && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <div className="text-sm font-medium text-purple-800 mb-1">Firebase Token</div>
              <div className="text-xs text-purple-600 font-mono break-all">
                {firebaseToken.substring(0, 32)}...
              </div>
            </div>
          )}

          {(error || firebaseError) && (
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="text-sm font-medium text-red-800 mb-1">Error</div>
              <div className="text-xs text-red-600">
                {error || firebaseError}
                {!Capacitor.isNativePlatform() && firebaseError && (
                  <div className="mt-2 text-xs">
                    💡 <strong>Need Firebase setup?</strong> Check the <code>FIREBASE_SETUP.md</code> guide
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
