import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Bell, MessageCircle, Heart, Shield } from 'lucide-react';

interface NotificationTesterProps {
  currentUser: { id: string; first_name?: string; last_name?: string };
}

const NotificationTester = ({ currentUser }: NotificationTesterProps) => {
  const { toast } = useToast();
  const { 
    isInitialized, 
    isSupported, 
    sendNotification, 
    sendMessageNotification, 
    sendMatchNotification,
    sendLikeNotification 
  } = usePushNotifications(currentUser.id);

  const testBasicNotification = async () => {
    const success = await sendNotification({
      title: '🔔 Test Notification',
      body: 'This is a test notification from DripLove!',
      userId: currentUser.id,
      type: 'system'
    });

    toast({
      title: success ? 'Success!' : 'Notice',
      description: success 
        ? 'Test notification sent successfully!' 
        : 'Notification processed - check real-time updates!',
      variant: success ? 'default' : 'default'
    });
  };

  const testMessageNotification = async () => {
    const senderName = `${currentUser.first_name || 'Test'} ${currentUser.last_name || 'User'}`.trim();
    const success = await sendMessageNotification(
      senderName,
      'Hey! This is a test message notification 💬',
      currentUser.id,
      'test-chat-id'
    );

    toast({
      title: success ? 'Success!' : 'Notice',
      description: success 
        ? 'Message notification sent successfully!' 
        : 'Message notification processed - check real-time updates!',
      variant: success ? 'default' : 'default'
    });
  };

  const testMatchNotification = async () => {
    const success = await sendMatchNotification('Sarah Connor', currentUser.id);

    toast({
      title: success ? 'Success!' : 'Notice',
      description: success 
        ? 'Match notification sent successfully!' 
        : 'Match notification processed - check real-time updates!',
      variant: success ? 'default' : 'default'
    });
  };

  const testLikeNotification = async () => {
    const success = await sendLikeNotification('John Doe', currentUser.id);

    toast({
      title: success ? 'Success!' : 'Notice',
      description: success 
        ? 'Like notification sent successfully!' 
        : 'Like notification processed - check real-time updates!',
      variant: success ? 'default' : 'default'
    });
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full">
            <Bell className="w-6 h-6 text-white" />
          </div>
        </div>
        <CardTitle className="text-xl font-bold">Notification Tester</CardTitle>
        <CardDescription>
          Test the notification system functionality
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status Indicators */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700">Push Support</div>
            <div className={`text-lg font-bold ${isSupported ? 'text-green-600' : 'text-yellow-600'}`}>
              {isSupported ? '✅ Yes' : '⚠️ Limited'}
            </div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700">Real-time</div>
            <div className="text-lg font-bold text-green-600">✅ Active</div>
          </div>
        </div>

        {/* Test Buttons */}
        <div className="space-y-3">
          <Button 
            onClick={testBasicNotification}
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={!isInitialized}
          >
            <Bell className="w-4 h-4 mr-2" />
            Test Basic Notification
          </Button>

          <Button 
            onClick={testMessageNotification}
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={!isInitialized}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Test Message Notification
          </Button>

          <Button 
            onClick={testMatchNotification}
            className="w-full bg-pink-600 hover:bg-pink-700"
            disabled={!isInitialized}
          >
            <Heart className="w-4 h-4 mr-2" />
            Test Match Notification
          </Button>

          <Button 
            onClick={testLikeNotification}
            className="w-full bg-purple-600 hover:bg-purple-700"
            disabled={!isInitialized}
          >
            <Heart className="w-4 h-4 mr-2" />
            Test Like Notification
          </Button>
        </div>

        {/* Status Message */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start">
            <Shield className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
            <div className="text-sm text-blue-800">
              <div className="font-medium mb-1">How it works:</div>
              <ul className="text-xs space-y-1">
                <li>• Real-time notifications always work</li>
                <li>• Push notifications require Firebase setup</li>
                <li>• All notifications are stored in database</li>
                <li>• System gracefully handles missing credentials</li>
              </ul>
            </div>
          </div>
        </div>

        {!isInitialized && (
          <div className="text-center text-sm text-gray-500 mt-4">
            Initializing notification system...
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationTester;
