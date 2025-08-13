
import React, { useState } from 'react';
import PaystackPaymentModal from './PaystackPaymentModal';
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
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [paymentType, setPaymentType] = useState<'subscription' | 'one-time' | null>(null);
  const [price, setPrice] = useState('50');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [currency, setCurrency] = useState('GHS');
  const [monthlyPrice, setMonthlyPrice] = useState<string>('');
  const [loadingPlanPrice, setLoadingPlanPrice] = useState(true);

  React.useEffect(() => {
    const loadPaymentConfig = async () => {
      const config = await getPremiumPaymentConfig();
      
      // Get user's country and currency
      let userCountry = currentUser?.country?.toLowerCase() || '';
      let userCurrency = currentUser?.currency?.toUpperCase?.() || '';
      let selectedCurrency = 'GHS';
      let selectedPrice = config.price || '50';

      // Try to find a match in countryPrices by country or currency
      if (Array.isArray(config.countryPrices)) {
        // Try match by country (case-insensitive)
        const countryEntry = config.countryPrices.find((entry: any) => entry.country?.toLowerCase() === userCountry);
        if (countryEntry) {
          selectedCurrency = countryEntry.currency || 'GHS';
          selectedPrice = countryEntry.price || selectedPrice;
        } else if (userCurrency) {
          // Try match by currency
          const currencyEntry = config.countryPrices.find((entry: any) => entry.currency?.toUpperCase() === userCurrency);
          if (currencyEntry) {
            selectedCurrency = currencyEntry.currency;
            selectedPrice = currencyEntry.price || selectedPrice;
          } else {
            selectedCurrency = config.currency || 'GHS';
          }
        } else {
          selectedCurrency = config.currency || 'GHS';
        }
      } else {
        selectedCurrency = config.currency || 'GHS';
      }

      setPrice(selectedPrice);
      setPaymentMethods(config.paymentMethods);
      setCurrency(selectedCurrency);

      // Fetch monthly plan price from Paystack
      if (config.paystackPlanCode) {
        try {
          setLoadingPlanPrice(true);
          const { data, error } = await supabase.functions.invoke('paystack-get-plan', {
            body: { planCode: config.paystackPlanCode }
          });

          if (!error && data?.success && data?.plan) {
            // Convert from kobo/pesewas to main currency
            const planAmount = data.plan.amount / 100;
            setMonthlyPrice(planAmount.toString());
          } else {
            console.error('Error fetching plan price:', error || data?.error);
          }
        } catch (error) {
          console.error('Error fetching plan price:', error);
        } finally {
          setLoadingPlanPrice(false);
        }
      } else {
        setLoadingPlanPrice(false);
      }
    };
    loadPaymentConfig();
  }, [currentUser]);

  const handleUpgrade = () => {
    if (!paymentMethods.length) {
      toast({
        title: 'Payment Method Required',
        description: 'No payment method is configured. Please contact admin.',
        variant: 'destructive',
      });
      return;
    }
    // Show payment options selection
    setShowPaymentOptions(true);
  };

  const handlePaymentTypeSelection = (type: 'subscription' | 'one-time') => {
    setPaymentType(type);
    setShowPaymentOptions(false);
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
    <div className="min-h-screen bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        {onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            className="mb-4 text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}
          
          {/* Header Section */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="relative">
                <Crown className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400 drop-shadow-lg" />
                <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-yellow-300 rounded-full animate-pulse"></div>
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-3 drop-shadow-lg">
              Upgrade to <span className="text-yellow-300">Premium</span>
            </h1>
          </div>

          {/* Plans Section */}
          <div className="grid lg:grid-cols-2 gap-4 lg:gap-6 w-full">
            
            {/* Premium Plan - Featured */}
            <div className="order-1 lg:order-1 w-full">
              <Card className="border-2 sm:border-3 border-yellow-400 relative overflow-hidden shadow-2xl bg-gradient-to-br from-white to-yellow-50 transition-all duration-300 w-full no-overflow">
                {/* Popular Badge */}
                <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-black px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm font-bold rounded-bl-lg shadow-lg responsive-text">
                ⭐ MOST POPULAR
              </div>
              
              <CardHeader className="text-center pb-4 sm:pb-6 pt-6 sm:pt-8 px-4">
                <CardTitle className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center justify-center text-gray-800 responsive-text">
                  <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500 mr-2 sm:mr-3" />
                  Premium Plan
                </CardTitle>
                <div className="mt-3 sm:mt-4">
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-800 responsive-text">
                    {currency} {price}
                  </div>
                  <div className="text-xs sm:text-sm text-green-600 font-medium mt-1">✨ Lifetime access</div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3 sm:space-y-5 px-4 sm:px-6 pb-6 sm:pb-8">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3 sm:space-x-4 p-2 sm:p-3 bg-white/60 rounded-lg">
                    <div className="bg-yellow-100 p-1.5 sm:p-2 rounded-full flex-shrink-0">
                      <feature.icon className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm sm:text-base responsive-text truncate">{feature.name}</div>
                      <div className="text-xs sm:text-sm text-green-600 font-medium responsive-text">{feature.premium}</div>
                    </div>
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                  </div>
                ))}
                
                {/* Extra Premium Features */}
                <div className="flex items-center space-x-3 sm:space-x-4 p-2 sm:p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                  <div className="bg-yellow-100 p-1.5 sm:p-2 rounded-full flex-shrink-0">
                    <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 text-sm sm:text-base responsive-text truncate">All Future Features</div>
                    <div className="text-xs sm:text-sm text-green-600 font-medium responsive-text">Included forever!</div>
                  </div>
                  <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                </div>

                {/* CTA Button */}
                <div className="pt-4 sm:pt-6 text-center">
                  <Button
                    onClick={handleUpgrade}
                    className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-400 hover:from-yellow-500 hover:via-yellow-600 hover:to-orange-500 text-black font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-xl text-base sm:text-lg shadow-xl transition-all duration-200 responsive-text"
                  >
                    <Crown className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                    Upgrade to Premium Now
                  </Button>
                  
                 
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Free Plan */}
          <div className="order-2 lg:order-2 w-full">
            <Card className="border-2 border-gray-200 shadow-lg bg-white relative transition-all duration-300 w-full no-overflow">
              <CardHeader className="text-center pb-4 sm:pb-6 px-4">
                <CardTitle className="text-xl sm:text-2xl font-bold text-gray-700 responsive-text">Free Plan</CardTitle>
                <div className="mt-3 sm:mt-4">
                  <div className="text-3xl sm:text-4xl font-bold text-gray-700 responsive-text">$0</div>
                  <div className="text-xs sm:text-sm text-gray-500 mt-1">Basic features only</div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-6 sm:pb-8">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3 sm:space-x-4 p-2 sm:p-3 bg-gray-50 rounded-lg">
                    <div className="bg-gray-100 p-1.5 sm:p-2 rounded-full flex-shrink-0">
                      <feature.icon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-700 text-sm sm:text-base responsive-text truncate">{feature.name}</div>
                      <div className="text-xs sm:text-sm text-gray-500 responsive-text">{feature.free}</div>
                    </div>
                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                  </div>
                ))}
                
                <div className="pt-4 sm:pt-6 text-center">
                  <p className="text-gray-500 text-xs sm:text-sm mt-3 responsive-text">
                    Limited features • Basic support
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="text-center mt-8 sm:mt-12 mb-4 sm:mb-6">
          <p className="text-white/80 text-xs sm:text-sm mb-3 sm:mb-4 responsive-text">
            ✨ Join 10,000+ happy premium members
          </p>
          <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-6 text-white/60">
            <span className="text-xs">🔒 SSL Secured</span>
            <span className="text-xs">💳 Safe Payments</span>
            <span className="text-xs">📱 Mobile Optimized</span>
          </div>
        </div>
      </div>

      {/* Payment Type Selection Modal */}
      {showPaymentOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button 
              onClick={() => setShowPaymentOptions(false)} 
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold mb-4 text-center">Choose Payment Option</h2>
            <div className="space-y-4">
                <button
                  onClick={() => handlePaymentTypeSelection('subscription')}
                  className="w-full p-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 font-semibold"
                >
                  <div className="text-lg">💳 Subscribe Monthly</div>
                  <div className="text-sm opacity-90">
                    {loadingPlanPrice ? 'Loading price...' : monthlyPrice ? `${currency} ${monthlyPrice}/month` : 'Automatic renewal'} • Cancel anytime
                  </div>
                </button>
                <button
                  onClick={() => handlePaymentTypeSelection('one-time')}
                  className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-semibold"
                >
                  <div className="text-lg">📱 One-Time Payment</div>
                  <div className="text-sm opacity-90">{currency} {price} • 1 month access • No auto-renewal</div>
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modals */}
      <PaystackPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        amount={parseFloat(price)}
        email={currentUser?.email || ''}
        onSuccess={handlePaymentSuccess}
        paymentMethod={paymentMethods[0]?.type || 'card'}
        isOneTime={paymentType === 'one-time'}
      />
    </div>
  );
};

export default PremiumUpgrade;
