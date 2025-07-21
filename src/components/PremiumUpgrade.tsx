
import React, { useState } from 'react';
import FlwPaymentModal from './FlwPaymentModal';
import { getPremiumPaymentConfig } from '@/utils/paymentConfig';
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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [price, setPrice] = useState('50');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [currency, setCurrency] = useState('GHS');

  React.useEffect(() => {
    const loadPaymentConfig = async () => {
      const config = await getPremiumPaymentConfig();
      setPrice(config.price);
      setPaymentMethods(config.paymentMethods);
      setCurrency(config.currency);
    };
    loadPaymentConfig();
  }, []);

  const handleUpgrade = () => {
    if (!paymentMethods.length) {
      toast({
        title: 'Payment Method Required',
        description: 'No payment method is configured. Please contact admin.',
        variant: 'destructive',
      });
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    toast({
      title: 'Premium Activated!',
      description: 'Your account has been upgraded to premium.',
    });
    setShowPaymentModal(false);
    if (onClose) onClose();
    // Optionally, trigger a refetch of subscription status here
    window.location.href = '/discover?upgraded=1';
  };

  const features = [
    { name: 'Unlimited Daily Swipes', free: '12 per day', premium: 'Unlimited', icon: Heart },
    { name: 'Reverse Dislikes', free: '2 per day', premium: 'Unlimited', icon: RotateCcw },
    { name: 'See All Who Liked You', free: '1 visible', premium: 'All visible', icon: Users },
    { name: 'Priority Support', free: 'Standard', premium: 'Priority', icon: Crown },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            className="mb-6 text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}
        
        {/* Header Section */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <Crown className="w-16 h-16 text-yellow-400 drop-shadow-lg" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-300 rounded-full animate-pulse"></div>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-lg">
            Upgrade to <span className="text-yellow-300">Premium</span>
          </h1>
        
        </div>

        {/* Plans Section */}
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
          
          {/* Premium Plan - Featured */}
          <div className="order-1 lg:order-1">
            <Card className="border-3 border-yellow-400 relative overflow-hidden shadow-2xl bg-gradient-to-br from-white to-yellow-50 transition-all duration-300">
              {/* Popular Badge */}
              <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-black px-4 py-2 text-sm font-bold rounded-bl-lg shadow-lg">
                ⭐ MOST POPULAR
              </div>
              
              <CardHeader className="text-center pb-6 pt-8">
                <CardTitle className="text-3xl font-bold flex items-center justify-center text-gray-800">
                  <Crown className="w-8 h-8 text-yellow-500 mr-3" />
                  Premium Plan
                </CardTitle>
                <div className="mt-4">
                  <div className="text-4xl sm:text-5xl font-bold text-gray-800">
                    GHS {price}
                  </div>
                  <div className="text-sm text-green-600 font-medium mt-1">✨ Lifetime access</div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-5 px-6 pb-8">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-4 p-3 bg-white/60 rounded-lg">
                    <div className="bg-yellow-100 p-2 rounded-full">
                      <feature.icon className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{feature.name}</div>
                      <div className="text-sm text-green-600 font-medium">{feature.premium}</div>
                    </div>
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  </div>
                ))}
                
                {/* Extra Premium Features */}
                <div className="flex items-center space-x-4 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                  <div className="bg-yellow-100 p-2 rounded-full">
                    <Crown className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800">All Future Features</div>
                    <div className="text-sm text-green-600 font-medium">Included forever!</div>
                  </div>
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                </div>

                {/* CTA Button */}
                <div className="pt-6 text-center">
                  <Button
                    onClick={handleUpgrade}
                    className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-400 hover:from-yellow-500 hover:via-yellow-600 hover:to-orange-500 text-black font-bold py-4 px-8 rounded-xl text-lg shadow-xl transition-all duration-200"
                  >
                    <Crown className="w-6 h-6 mr-3" />
                    Upgrade to Premium Now
                  </Button>
                  
                 
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Free Plan */}
          <div className="order-2 lg:order-2">
            <Card className="border-2 border-gray-200 shadow-lg bg-white relative transition-all duration-300">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-bold text-gray-700">Free Plan</CardTitle>
                <div className="mt-4">
                  <div className="text-4xl font-bold text-gray-700">$0</div>
                  <div className="text-sm text-gray-500 mt-1">Basic features only</div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4 px-6 pb-8">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                    <div className="bg-gray-100 p-2 rounded-full">
                      <feature.icon className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-700">{feature.name}</div>
                      <div className="text-sm text-gray-500">{feature.free}</div>
                    </div>
                    <X className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                ))}
                
                <div className="pt-6 text-center">
                  <p className="text-gray-500 text-sm mt-3">
                    Limited features • Basic support
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="text-center mt-12 mb-6">
          <p className="text-white/80 text-sm mb-4">
            ✨ Join 10,000+ happy premium members
          </p>
          <div className="flex justify-center items-center space-x-6 text-white/60">
            <span className="text-xs">🔒 SSL Secured</span>
            <span className="text-xs">💳 Safe Payments</span>
            <span className="text-xs">📱 Mobile Optimized</span>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <FlwPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        amount={parseFloat(price)}
        email={currentUser?.email || ''}
        paymentMethods={paymentMethods}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};

export default PremiumUpgrade;
