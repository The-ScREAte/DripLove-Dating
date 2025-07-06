
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
        const { error } = await supabase
          .from('user_subscriptions')
          .upsert({
            user_id: user.id,
            plan_name: 'premium',
            status: 'active',
            flutterwave_transaction_id: transaction_id,
            tx_ref
          });
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
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <Crown className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2 text-gray-800">Thank You for Upgrading!</h1>
        <p className="mb-4 text-gray-700">Your payment was successful. You now have access to all premium features:</p>
        <ul className="mb-6 text-left">
          {premiumFeatures.map((feature, idx) => (
            <li key={feature.name} className="flex items-center mb-2">
              <feature.icon className="w-5 h-5 text-pink-500 mr-2" />
              <span className="text-gray-800">{feature.name}</span>
            </li>
          ))}
        </ul>
        {upgrading && <div className="mb-4 text-pink-600 font-semibold">Activating premium...</div>}
        {error && <div className="mb-4 text-red-600 font-semibold">{error}</div>}
        <Button
          className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold py-3 px-8 rounded-full text-lg shadow-lg hover:scale-105 transition-all duration-200"
          onClick={() => navigate('/')}
          disabled={upgrading}
        >
          Go to Discover
        </Button>
      </div>
    </div>
  );
};

export default PaymentSuccess;
