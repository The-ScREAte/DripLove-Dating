import React, { useState } from 'react';
import { isNativeApp } from '@/utils/iap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';

const REQUIRED_PHRASE = 'i want to unsubscribe';

const Unsubscribe: React.FC = () => {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showManageInstructions, setShowManageInstructions] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const openAppleSubscriptionManagement = async () => {
    try {
      // For iOS, open Apple's subscription management
      if (Capacitor.getPlatform() === 'ios') {
        // iOS 15+: Direct link to subscription management in Settings
        // Using itms-apps:// scheme to open directly in App Store app
        const url = 'itms-apps://apps.apple.com/account/subscriptions';
        
        // Use window.open for iOS as it properly opens the URL
        if (window.open) {
          window.open(url, '_system');
        } else {
          // Fallback to showing manual instructions
          setShowManageInstructions(true);
        }
      } else {
        // Fallback for web or Android
        setError('Please manage your subscription through your Apple account settings.');
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

      // For Apple IAP subscriptions, we MUST redirect to Apple's subscription management
      // Apps cannot programmatically cancel Apple subscriptions
      if (isNativeApp() && subscription.payment_method === 'apple') {
        // Mark as pending cancellation in database
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({ 
            auto_renew: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('id', subscription.id);

        if (updateError) {
          throw new Error(updateError.message || 'Failed to update subscription status');
        }

        // Open Apple's subscription management
        await openAppleSubscriptionManagement();
        
        toast({
          title: 'Cancel in Apple Settings',
          description: 'You will be redirected to manage your subscription in Apple Settings. Please cancel there to complete the process.',
        });
        
        return;
      }

      // For non-Apple subscriptions (Paystack, web subscriptions, etc.)

      // For non-Apple subscriptions (Paystack, etc.), update status to cancelled
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

      // Show success message for non-Apple subscriptions
      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription has been successfully cancelled.',
      });

      // For Paystack subscriptions, we should also call their API to cancel
      // This ensures the subscription is cancelled on the provider's side too
      if (subscription.payment_method === 'paystack' && subscription.flutterwave_transaction_id) {
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
            <p className="text-gray-700 font-semibold">To cancel your Apple subscription:</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-600 text-sm">
              <li>Open the <strong>Settings</strong> app on your iPhone/iPad</li>
              <li>Tap your <strong>Apple ID</strong> at the top</li>
              <li>Tap <strong>Subscriptions</strong></li>
              <li>Select <strong>DripLove</strong></li>
              <li>Tap <strong>Cancel Subscription</strong></li>
            </ol>
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
