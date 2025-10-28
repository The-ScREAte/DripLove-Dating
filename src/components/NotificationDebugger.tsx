import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Bell, Send, Check, X } from 'lucide-react';

interface NotificationDebuggerProps {
  currentUserId: string;
}

const NotificationDebugger: React.FC<NotificationDebuggerProps> = ({ currentUserId }) => {
  const { toast } = useToast();
  const { sendNotification, isInitialized } = usePushNotifications(currentUserId);
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<{
    tokenCheck?: boolean;
    notificationSent?: boolean;
    error?: string;
  }>({});

  const checkPushToken = async () => {
    try {
      const { data, error } = await supabase
        .from('push_tokens')
        .select('*')
        .eq('user_id', currentUserId);

      if (error) throw error;

      if (data && data.length > 0) {
        setTestResults(prev => ({ ...prev, tokenCheck: true }));
        toast({
          title: '✅ Push Token Found',
          description: `Found ${data.length} device token(s) registered`,
        });
        return true;
      } else {
        setTestResults(prev => ({ ...prev, tokenCheck: false }));
        toast({
          title: '❌ No Push Token',
          description: 'No push token found. Try restarting the app.',
          variant: 'destructive'
        });
        return false;
      }
    } catch (error) {
      console.error('Token check error:', error);
      setTestResults(prev => ({ ...prev, tokenCheck: false, error: String(error) }));
      toast({
        title: '❌ Error',
        description: 'Failed to check push token',
        variant: 'destructive'
      });
      return false;
    }
  };

  const sendTestNotification = async () => {
    setIsLoading(true);
    try {
      console.log('🧪 Sending test notification...');
      
      const result = await sendNotification({
        title: '🧪 Test Notification',
        body: 'If you see this, push notifications are working!',
        userId: currentUserId,
        type: 'system',
        data: { test: true }
      });

      console.log('🧪 Test notification result:', result);

      setTestResults(prev => ({ ...prev, notificationSent: result }));
      
      if (result) {
        toast({
          title: '✅ Success!',
          description: 'Test notification sent. Check your device!',
        });
      } else {
        toast({
          title: '⚠️ Partial Success',
          description: 'Notification stored but push may have failed. Check edge function logs.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Test notification error:', error);
      setTestResults(prev => ({ ...prev, notificationSent: false, error: String(error) }));
      toast({
        title: '❌ Failed',
        description: 'Failed to send test notification',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runFullTest = async () => {
    setIsLoading(true);
    setTestResults({});
    
    // Step 1: Check token
    const hasToken = await checkPushToken();
    
    // Step 2: Send test notification
    if (hasToken) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await sendTestNotification();
    }
    
    setIsLoading(false);
  };

  return (
    <Card className="p-4 bg-card">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          <h3 className="font-semibold">Push Notification Debugger</h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span>Notification Service:</span>
            {isInitialized ? (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="w-4 h-4" /> Initialized
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-600">
                <X className="w-4 h-4" /> Not Initialized
              </span>
            )}
          </div>

          {testResults.tokenCheck !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span>Push Token:</span>
              {testResults.tokenCheck ? (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="w-4 h-4" /> Registered
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-600">
                  <X className="w-4 h-4" /> Missing
                </span>
              )}
            </div>
          )}

          {testResults.notificationSent !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span>Test Notification:</span>
              {testResults.notificationSent ? (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="w-4 h-4" /> Sent
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600">
                  <X className="w-4 h-4" /> Failed/Partial
                </span>
              )}
            </div>
          )}

          {testResults.error && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
              {testResults.error}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={checkPushToken} 
            variant="outline" 
            size="sm"
            disabled={isLoading}
          >
            Check Token
          </Button>
          <Button 
            onClick={sendTestNotification} 
            variant="outline" 
            size="sm"
            disabled={isLoading || !isInitialized}
          >
            <Send className="w-4 h-4 mr-2" />
            Send Test
          </Button>
          <Button 
            onClick={runFullTest} 
            size="sm"
            disabled={isLoading}
          >
            Run Full Test
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          <p className="font-semibold mb-1">Troubleshooting Steps:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Ensure push notifications permission is granted on your device</li>
            <li>Check that FCM_CREDENTIALS secret is set in Supabase</li>
            <li>Verify the app is connected to Firebase correctly</li>
            <li>Check edge function logs for detailed error messages</li>
            <li>Try restarting the app to re-register the push token</li>
          </ol>
        </div>
      </div>
    </Card>
  );
};

export default NotificationDebugger;
