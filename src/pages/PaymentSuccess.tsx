
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Crown, Heart, RotateCcw, Users, Check } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const premiumFeatures = [
  { name: 'Unlimited Daily Swipes', icon: Heart },
  { name: 'Reverse Dislikes', icon: RotateCcw },
  { name: 'See All Who Liked You', icon: Users },
  { name: 'Priority Support', icon: Crown },
  { name: 'All future premium features included!', icon: Check },
];

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for payment success in query params
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    const tx_ref = params.get('tx_ref');
    const transaction_id = params.get('transaction_id');
    if (status === 'successful' && transaction_id) {
      setUpgrading(true);
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        const user = session?.user;
        if (!user) {
          setError('User not logged in. Please log in again.');
          setUpgrading(false);
          return;
        }
        // Fetch transaction details from Flutterwave
        let flwToken = null;
        let flwSubscriptionId = null;
        let paymentType = null;
        try {
          const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_FLW_SECRET_KEY}`,
            },
          });
          const flwData = await flwRes.json();
          // Card tokenization
          flwToken = flwData?.data?.card?.token || null;
          // MoMo tokenization (if available)
          if (!flwToken && flwData?.data?.meta?.authorization) {
            flwToken = flwData.data.meta.authorization.token;
          }
          // Subscription ID (if available)
          flwSubscriptionId = flwData?.data?.subscription?.id || null;
          paymentType = flwData?.data?.payment_type || null;
        } catch (err) {
          // If fetch fails, continue but don't save token
          console.error('Failed to fetch Flutterwave transaction:', err);
        }
        // Set up subscription with recurring billing
        const subscriptionData: any = {
          plan_name: 'premium',
          status: 'active',
          flutterwave_transaction_id: transaction_id,
          starts_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          auto_renew: true,
          payment_method: paymentType === 'card' ? 'card' : 'momo',
          updated_at: new Date().toISOString(),
        };
        
        // Add tokens for recurring billing
        if (flwToken && paymentType === 'card') subscriptionData.flw_card_token = flwToken;
        if (flwToken && paymentType === 'mobilemoneyghana') subscriptionData.flw_momo_token = flwToken;
        if (flwSubscriptionId) subscriptionData.flw_subscription_id = flwSubscriptionId;
        
        // Upsert subscription (update if exists, insert if not)
        const { error } = await supabase
          .from('user_subscriptions')
          .upsert(
            { user_id: user.id, ...subscriptionData },
            { onConflict: 'user_id' }
          );
        if (!error) {
          setUpgradeSuccess(true);
          toast({ title: 'Premium Activated!', description: 'Your account has been upgraded.' });
        } else {
          setError('Could not activate premium. Contact support.');
        }
        setUpgrading(false);
      });
    }
  }, [location.search, toast]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border-4 border-yellow-300/60 relative animate-fade-in">
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full p-3 shadow-lg animate-bounce">
          <Crown className="w-14 h-14 text-yellow-600" />
        </div>
        <h1 className="text-4xl font-extrabold mb-3 mt-8 text-gray-900 tracking-tight drop-shadow-lg">Welcome to Premium!</h1>
        <p className="mb-6 text-lg text-gray-700 font-medium">Your payment was successful.<br/>You now have access to:</p>
        <ul className="mb-8 text-left space-y-3">
          {premiumFeatures.map((feature, idx) => (
            <li key={feature.name} className="flex items-center gap-3 bg-gradient-to-r from-pink-100 to-yellow-100 rounded-xl px-4 py-2 shadow-sm">
              <span className="inline-flex items-center justify-center bg-pink-200 rounded-full p-2"><feature.icon className="w-6 h-6 text-pink-500" /></span>
              <span className="text-gray-900 font-semibold text-base">{feature.name}</span>
            </li>
          ))}
        </ul>
        {upgrading && <div className="mb-4 text-pink-600 font-semibold animate-pulse">Activating premium...</div>}
        {error && <div className="mb-4 text-red-600 font-semibold animate-shake">{error}</div>}
        <Button
          className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-extrabold py-3 px-8 rounded-full text-xl shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-200 mt-2"
          onClick={() => navigate('/')}
          disabled={upgrading}
        >
          Start Discovering Now
        </Button>
        <div className="mt-6 text-xs text-gray-400">Enjoy your premium experience! 🎉</div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
