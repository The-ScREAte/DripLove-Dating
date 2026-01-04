import React, { useState } from 'react';
import { isNativeApp } from '@/utils/iap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const REQUIRED_PHRASE = 'i want to unsubscribe';

const Unsubscribe: React.FC = () => {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showManageInstructions, setShowManageInstructions] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const openNativeSubscriptionManagement = async (platform: 'ios' | 'android') => {
    try {
      if (platform === 'ios') {
        if (Capacitor.isNativePlatform()) {
          try {
            await Browser.open({ 
              url: 'itms-apps://apps.apple.com/account/subscriptions',
              windowName: '_system',
              toolbarColor: '#FF1493'
            });
            return;
          } catch (browserErr) {
            try {
              await Browser.open({ 
                url: 'App-prefs:root=SUBSCRIPTIONS',
                windowName: '_system'
              });
              return;
            } catch (settingsErr) {
              // Continue to fallback
            }
          }
        }
        
        try {
          window.location.href = 'itms-apps://apps.apple.com/account/subscriptions';
          return;
        } catch (locationErr) {
          // Continue to manual instructions
        }
        
        setShowManageInstructions(true);
        
      } else if (platform === 'android') {
        const url = 'https://play.google.com/store/account/subscriptions';
        
        if (Capacitor.isNativePlatform()) {
          try {
            await Browser.open({ 
              url, 
              windowName: '_system',
              toolbarColor: '#FF1493'
            });
            return;
          } catch (browserErr) {
            // Continue to fallback
          }
        }
        
        const opened = window.open(url, '_system');
        if (!opened) {
          setShowManageInstructions(true);
        }
      }
    } catch (err) {
      console.error('Error opening subscription management:', err);
      setShowManageInstructions(true);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    setError('');
    try {
      // Get current user ID from Supabase Auth
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Could not get user ID');

      // Get the active subscription
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (subError) {
        throw new Error(subError.message);
      }

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // For iOS/Android IAP subscriptions, redirect to native settings
      if (isNativeApp() && (subscription.payment_method === 'apple' || subscription.payment_method === 'google' || subscription.payment_method === 'iap')) {
        const platform = Capacitor.getPlatform() as 'ios' | 'android';
        
        // Open native subscription management (don't show toast yet)
        await openNativeSubscriptionManagement(platform);
        
        // Only show instructions if redirect failed
        if (showManageInstructions) {
          toast({
            title: 'Manual Cancellation Required',
            description: `Please cancel your subscription in ${platform === 'ios' ? 'Apple' : 'Google Play'} Settings.`,
            variant: 'destructive'
          });
        }
        
        setLoading(false);
        return;
      }

      // For Paystack subscriptions, call the cancel-subscription Edge Function
      if (subscription.payment_method === 'paystack') {
        const { error: cancelError } = await supabase.functions.invoke('cancel-subscription', {
          body: { user_id: user.id }
        });

        if (cancelError) {
          throw new Error(cancelError.message || 'Failed to cancel subscription');
        }

        toast({
          title: 'Subscription Cancelled',
          description: `Your subscription has been cancelled. You will remain premium until ${subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : 'the end of your period'}.`,
        });
      } else {
        // Fallback for other payment methods
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({ 
            status: 'cancelled',
            auto_renew: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('id', subscription.id);

        if (updateError) {
          throw new Error(updateError.message || 'Failed to update subscription status');
        }

        toast({
          title: 'Subscription Cancelled',
          description: 'Your subscription has been successfully cancelled.',
        });
      }

      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to cancel subscription.');
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="min-h-fill flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border-4 border-red-300/60 relative animate-fade-in">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Cancel Subscription</h1>
        
        {showManageInstructions ? (
          <div className="text-left space-y-4">
            <p className="text-gray-700 font-semibold">To cancel your subscription:</p>
            
            {Capacitor.getPlatform() === 'ios' ? (
              <div>
                <p className="text-sm text-gray-600 mb-2">For Apple/iOS:</p>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 text-sm">
                  <li>Open the <strong>Settings</strong> app on your iPhone/iPad</li>
                  <li>Tap your <strong>Apple ID</strong> at the top</li>
                  <li>Tap <strong>Subscriptions</strong></li>
                  <li>Select <strong>DripLove</strong></li>
                  <li>Tap <strong>Cancel Subscription</strong></li>
                </ol>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-2">For Google Play/Android:</p>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 text-sm">
                  <li>Open the <strong>Google Play Store</strong> app</li>
                  <li>Tap your <strong>Profile</strong> icon at the top right</li>
                  <li>Tap <strong>Payments & subscriptions</strong> → <strong>Subscriptions</strong></li>
                  <li>Select <strong>DripLove</strong></li>
                  <li>Tap <strong>Cancel subscription</strong></li>
                </ol>
              </div>
            )}
            
            <Button
              onClick={() => {
                setShowManageInstructions(false);
                navigate('/');
              }}
              className="w-full mt-4"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-gray-700">To confirm, type <span className="font-mono bg-gray-100 px-2 py-1 rounded">{REQUIRED_PHRASE}</span> below and click Unsubscribe.</p>
            <Input
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              placeholder="Type the phrase exactly..."
              className="mb-2"
            />
            {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
            <Button
              onClick={handleUnsubscribe}
              disabled={loading || confirmation.trim().toLowerCase() !== REQUIRED_PHRASE.toLowerCase()}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg mt-2"
            >
              {loading ? 'Processing...' : 'Unsubscribe'}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full mt-2"
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;
