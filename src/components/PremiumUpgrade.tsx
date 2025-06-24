
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Heart, RotateCcw, Users, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PremiumUpgradeProps {
  currentUser: any;
  onClose?: () => void;
  preselectedPlan?: 'premium';
}

const PremiumUpgrade = ({ currentUser, onClose, preselectedPlan }: PremiumUpgradeProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleUpgrade = async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    try {
      // For now, we'll just redirect to flutterwave.com
      // Later you can replace this with actual Flutterwave integration
      const paymentUrl = `https://flutterwave.com/pay/premium-plan-${currentUser.id}`;
      
      // Open payment in new tab
      window.open(paymentUrl, '_blank');
      
      toast({
        title: 'Redirecting to Payment',
        description: 'You will be redirected to complete your premium upgrade.',
      });
    } catch (error) {
      console.error('Error initiating payment:', error);
      toast({
        title: 'Error',
        description: 'Failed to initiate payment. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { name: 'Unlimited Daily Swipes', free: '12 per day', premium: 'Unlimited', icon: Heart },
    { name: 'Reverse Dislikes', free: '2 per day', premium: 'Unlimited', icon: RotateCcw },
    { name: 'See All Who Liked You', free: '1 visible', premium: 'All visible', icon: Users },
    { name: 'Priority Support', free: 'Standard', premium: 'Priority', icon: Crown },
  ];

  return (
<div className="h-screen overflow-y-auto bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
<div className="max-w-4xl w-full mx-auto py-8">
        {onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            className="mb-4 text-white hover:bg-white/20"
          >
            <X className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}
        
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Crown className="w-12 h-12 text-yellow-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Upgrade to Premium</h1>
          <p className="text-white/80 text-lg">Unlock unlimited features and find your perfect match faster!</p>
        </div>

        <div className="flex flex-col gap-6 mb-8">
        {/* Free Plan */}
          <Card className="border-2">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Free Plan</CardTitle>
              <div className="text-3xl font-bold">$0<span className="text-sm font-normal">/month</span></div>
            </CardHeader>
            <CardContent className="space-y-4">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <feature.icon className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="font-medium">{feature.name}</div>
                    <div className="text-sm text-gray-600">{feature.free}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Premium Plan */}
          <Card className="border-2 border-yellow-400 relative overflow-hidden">
  <div className="absolute top-0 right-0 bg-yellow-400 text-black px-3 py-1 text-sm font-bold">
    POPULAR
  </div>
  <CardHeader className="text-center">
    <CardTitle className="text-2xl flex items-center justify-center">
      <Crown className="w-6 h-6 text-yellow-500 mr-2" />
      Premium Plan
    </CardTitle>
    <div className="text-3xl font-bold">
      $9.99<span className="text-sm font-normal">/month</span>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {features.map((feature, index) => (
      <div key={index} className="flex items-center space-x-3">
        <feature.icon className="w-5 h-5 text-yellow-500" />
        <div>
          <div className="font-medium">{feature.name}</div>
          <div className="text-sm text-green-600 font-medium">{feature.premium}</div>
        </div>
      </div>
    ))}
    <div className="flex items-center space-x-3 pt-2 border-t">
      <Check className="w-5 h-5 text-green-500" />
      <div className="font-medium text-green-600">
        All future premium features included!
      </div>
    </div>

    {/* 👇 Move the button and info here */}
    <div className="pt-6 text-center">
      <Button
        onClick={handleUpgrade}
        disabled={loading}
        className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold py-3 px-8 rounded-full text-lg shadow-lg transform hover:scale-105 transition-all duration-200"
      >
        {loading ? (
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
            Processing...
          </div>
        ) : (
          <>
            <Crown className="w-5 h-5 mr-2" />
            Upgrade to Premium Now
          </>
        )}
      </Button>
      <p className="text-gray-600 text-sm mt-2">
        Secure payment powered by Flutterwave • Cancel anytime
      </p>
    </div>
  </CardContent>
</Card>
</div>
<br />
<br />
<br />
      </div>
    </div>
  );
};

export default PremiumUpgrade;
