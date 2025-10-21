
import React, { useState } from 'react';
import PaystackPaymentModal from './PaystackPaymentModal';
import { getPremiumPaymentConfig } from '@/utils/paymentConfig';
import { isIOS, isNativeApp } from '@/utils/iap';
import { buyMonthly, debugIAPState } from '../iap';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Heart, RotateCcw, Users, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedSubscription } from '@/hooks/useEnhancedSubscription';

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
  const [paymentType, setPaymentType] = useState<'subscription' | 'one-time' | 'iap' | null>(null);
  const [iapLoading, setIapLoading] = useState(false);
  const [canBuy, setCanBuy] = useState(false);
  const [iapLoadingTimeout, setIapLoadingTimeout] = useState(false);
  
  // Enhanced subscription status monitoring
  const { subscriptionStatus, isPremium, loading: subscriptionLoading, refetch: refetchSubscription } = useEnhancedSubscription();

  React.useEffect(() => {
    // Listen for productUpdated to enable the in-app purchase button
    function onProductUpdated(p?: any) {
      // @ts-ignore
      const product = window.CdvPurchase?.store?.get?.('com.driplove.dating.premium.monthlysub');
      const hasOffer = !!product?.getOffer?.();
      setCanBuy(hasOffer);
      
      // If product becomes available, clear the timeout flag
      if (hasOffer) {
        setIapLoadingTimeout(false);
      }
      
      // Check if initialization failed
      // @ts-ignore
      if (window.iapInitializationFailed && !hasOffer) {
        setIapLoadingTimeout(true);
        setCanBuy(false);
      }
    }
    
    // Listen for verified purchases to reset loading state
    function onVerified(r?: any) {
      if (r?.productId === 'com.driplove.dating.premium.monthlysub') {
        setIapLoading(false);
        setShowPaymentOptions(false);
      }
    }
    
    // Listen for unverified purchases (includes cancellations)
    function onUnverified(r?: any, err?: any) {
      if (r?.productId === 'com.driplove.dating.premium.monthlysub') {
        setIapLoading(false);
        toast({
          title: 'Purchase Cancelled',
          description: 'The purchase was cancelled or could not be verified.',
        });
      }
    }
    
    // Listen for errors (includes user cancellations)
    function onError(e?: any) {
      // User cancellation typically has specific error codes
      if (e?.code === 'UserCancel' || e?.code === 2 || e?.message?.toLowerCase()?.includes('cancel')) {
        setIapLoading(false);
        toast({
          title: 'Purchase Cancelled',
          description: 'The purchase was cancelled.',
        });
      }
    }
    
    // @ts-ignore
    const store = window.CdvPurchase?.store;
    if (store && store.when && typeof store.when === 'function') {
      try {
        // Listen to purchase events using the correct API
        store.when()
          .productUpdated(onProductUpdated)
          .verified(onVerified)
          .unverified(onUnverified);
      } catch (error) {
        console.warn('[UI] Error setting up IAP listeners:', error);
      }
    }
    
    // Also listen for global errors
    if (store && store.error && typeof store.error === 'function') {
      try {
        store.error(onError);
      } catch (error) {
        console.warn('[UI] Error setting up global error listener:', error);
      }
    }
    
    // Also check current state
    onProductUpdated();
    
    // Initial check with delay
    setTimeout(() => {
      onProductUpdated();
    }, 1000);
    
    // Set timeout for IAP loading - applies to ALL platforms including iOS
    let loadingTimeout: NodeJS.Timeout | undefined;
    
    loadingTimeout = setTimeout(() => {
      if (!canBuy) {
        console.warn('[UI] IAP loading timeout - products not available after 8 seconds');
        setIapLoadingTimeout(true);
        
        // Different messages for iOS vs other platforms
        if (isIOS() && isNativeApp()) {
          toast({
            title: 'Connection Issue',
            description: 'Unable to connect to the App Store. Please check your internet connection and try again.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'In-App Purchase Unavailable',
            description: 'In-App Purchase is taking too long to load. Please use the alternative payment options below.',
          });
        }
      }
    }, 8000); // 8 seconds timeout for better UX
    
    // Cleanup
    return () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
    // No off/unsubscribe in plugin
  }, [toast, canBuy]);
  const [price, setPrice] = useState<string | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [currency, setCurrency] = useState('GHS');

  React.useEffect(() => {
    const loadPaymentConfig = async () => {
      const config = await getPremiumPaymentConfig();
      
      // Get user's country and currency
      let userCountry = currentUser?.country?.toLowerCase() || '';
      let userCurrency = currentUser?.currency?.toUpperCase?.() || '';
      let selectedCurrency = 'GHS';
      let selectedPrice = config.price || '0'; // Fallback to 0 if no price configured in database

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
      setMonthlyPrice(config.monthlyPrice);
      setPaymentMethods(config.paymentMethods);
      setCurrency(selectedCurrency);
    };
    loadPaymentConfig();
  }, [currentUser]);

  const handleUpgrade = () => {
    // Don't allow upgrade if price hasn't loaded yet
    if (price === null) {
      toast({
        title: 'Loading...',
        description: 'Please wait while we load pricing information.',
      });
      return;
    }
    
    // Check if we're on iOS and IAP initialization has failed
    if (isIOS() && isNativeApp() && window.iapInitializationFailed) {
      toast({
        title: 'Connection Issue',
        description: 'Unable to connect to the App Store. Please restart the app and try again.',
        variant: 'destructive',
      });
      return;
    }
    
    // Always show payment options - let user choose
    setShowPaymentOptions(true);
  };

  const handlePaymentTypeSelection = async (type: 'subscription' | 'one-time' | 'iap') => {
    if (type === 'iap') {
      // Debug current state
      debugIAPState();
      
      if (!canBuy) {
        // Check if initialization failed
        // @ts-ignore
        if (window.iapInitializationFailed) {
          toast({
            title: 'In-App Purchase Unavailable',
            description: 'The App Store connection failed to initialize. Please restart the app or use alternative payment options.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Loading...',
            description: 'Products are still loading. Please wait a moment and try again.',
          });
        }
        return;
      }
      
      setIapLoading(true);
      
      // Add timeout protection (30 seconds)
      const timeoutId = setTimeout(() => {
        console.error('[UI] IAP purchase timeout after 30 seconds');
        setIapLoading(false);
        toast({
          title: 'Purchase Timeout',
          description: 'The purchase is taking too long. Please try again or contact support.',
          variant: 'destructive',
        });
      }, 30000);
      
      try {
        await buyMonthly();
        
        clearTimeout(timeoutId);
        
        // Removed: Purchase Started toast
        
        // Don't close the modal immediately - let the purchase flow complete
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('[UI] IAP purchase failed:', err);
        
        let errorMessage = 'Purchase failed. Please try again.';
        
        if (err?.message?.includes('not loaded')) {
          errorMessage = 'Product not loaded yet. Please wait and try again.';
        } else if (err?.message?.includes('No purchasable offer')) {
          errorMessage = 'Product not ready for purchase. Please wait and try again.';
        } else if (err?.message?.includes('timeout') || err?.message?.includes('Timeout')) {
          errorMessage = 'Purchase timeout. Please check your connection and try again.';
        } else if (err?.message) {
          errorMessage = err.message;
        }
        
        toast({
          title: 'Purchase Failed',
          description: errorMessage,
          variant: 'destructive',
        });
        
        setIapLoading(false);
        // Don't close payment options to allow retry
      }
    } else {
      setPaymentType(type);
      setShowPaymentOptions(false);
      setShowPaymentModal(true);
    }
  };

  const handlePaymentSuccess = () => {
    // Removed: Premium activated toast
    setShowPaymentModal(false);
    
    // Refetch subscription status to update UI
    refetchSubscription();
    
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
  <div
    className="min-h-screen bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700 overflow-y-auto"
    style={{
      // Use clamp to respect the device safe-area inset while keeping
      // a reasonable minimum and maximum top padding for notched devices.
      paddingTop: 'clamp(16px, env(safe-area-inset-top, 0px), 28px)',
      // Keep the responsive horizontal padding via remaining classes on inner container
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)'
    }}
  >
      <div
        className="max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto px-0 sm:px-2 md:px-4 lg:px-6"
        style={{
          // Ensure there is enough bottom padding on devices with a home indicator
          paddingBottom: 'clamp(56px, env(safe-area-inset-bottom, 10px), 24px)'
        }}
      >
        {onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            // push down a bit and remove malformed class
            className="mt-6 text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}
          
          {/* Header Section */}
          <div className="text-center mb-4 md:mb-6">
            <div className="flex items-center justify-center mb-2 md:mb-4">
              <div className="relative">
                <Crown className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 text-yellow-400 drop-shadow-lg" />
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 bg-yellow-300 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Plans Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 lg:gap-6 w-full">
            
            {/* Premium Plan - Featured */}
            <div className="order-1 md:order-1 w-full">
              <Card className="border-2 border-yellow-400 relative overflow-hidden shadow-xl bg-gradient-to-br from-white to-yellow-50 transition-all duration-300 w-full">
                {/* Popular Badge */}
                <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-black px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-bold rounded-bl-lg shadow-lg responsive-text">
                  ⭐ MOST POPULAR
                </div>
              
              <CardHeader className="text-center pb-3 md:pb-5 pt-4 md:pt-7 px-2 md:px-4">
                <CardTitle className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold flex items-center justify-center text-gray-800 responsive-text">
                  <Crown className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 text-yellow-500 mr-2 sm:mr-3" />
                  Premium Plan
                </CardTitle>
                <div className="mt-2 md:mt-3">
                  <div className="space-y-2 md:space-y-3">
                    {/* One-time payment option */}
                    <div className="p-2 md:p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                      <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 responsive-text">
                        {price !== null ? `${currency} ${price}` : 'Loading...'}
                      </div>
                      {!isIOS() && (
                        <div className="text-xs md:text-sm text-green-600 font-medium mt-1">✨ One-time payment - Lifetime access</div>
                      )}
                    </div>
                    
                    {/* Monthly payment option */}
                    {monthlyPrice && (
                      <div className="p-2 md:p-3 bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-lg">
                        <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 responsive-text">
                          {currency} {monthlyPrice}/month
                        </div>
                        <div className="text-xs md:text-sm text-blue-600 font-medium mt-1">📱 Monthly subscription - Cancel anytime</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-2 md:space-y-4 px-2 md:px-5 pb-4 md:pb-7">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2 md:space-x-3 p-1.5 md:p-2.5 bg-white/60 rounded-lg">
                    <div className="bg-yellow-100 p-1 md:p-1.5 rounded-full flex-shrink-0">
                      <feature.icon className="w-4 h-4 md:w-5 md:h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-xs md:text-base responsive-text truncate">{feature.name}</div>
                      <div className="text-xs md:text-sm text-green-600 font-medium responsive-text">{feature.premium}</div>
                    </div>
                    <Check className="w-4 h-4 md:w-5 md:h-5 text-green-500 flex-shrink-0" />
                  </div>
                ))}
                
                {/* Extra Premium Features */}
                <div className="flex items-center space-x-2 md:space-x-3 p-1.5 md:p-2.5 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                  <div className="bg-yellow-100 p-1 md:p-1.5 rounded-full flex-shrink-0">
                    <Crown className="w-4 h-4 md:w-5 md:h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 text-xs md:text-base responsive-text truncate">All Future Features</div>
                    <div className="text-xs md:text-sm text-green-600 font-medium responsive-text">Included forever!</div>
                  </div>
                  <Check className="w-4 h-4 md:w-5 md:h-5 text-green-500 flex-shrink-0" />
                </div>

                {/* CTA Button */}
                <div className="pt-3 md:pt-5 text-center">
                  <Button
                    onClick={handleUpgrade}
                    className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-400 hover:from-yellow-500 hover:via-yellow-600 hover:to-orange-500 text-black font-bold py-2.5 md:py-4 px-4 md:px-8 rounded-xl text-base md:text-lg shadow-xl transition-all duration-200 responsive-text"
                  >
                    <Crown className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3" />
                    Upgrade to Premium Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Free Plan */}
          <div className="order-2 md:order-2 w-full">
            <Card className="border-2 border-gray-200 shadow-md bg-white relative transition-all duration-300 w-full">
              <CardHeader className="text-center pb-3 md:pb-5 px-2 md:px-4">
                <CardTitle className="text-lg sm:text-xl md:text-2xl font-bold text-gray-700 responsive-text">Free Plan</CardTitle>
                <div className="mt-2 md:mt-3">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-700 responsive-text">{currency} 0</div>
                  <div className="text-xs md:text-sm text-gray-500 mt-1">Basic features only</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 md:space-y-3 px-2 md:px-5 pb-4 md:pb-7">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2 md:space-x-3 p-1.5 md:p-2.5 bg-gray-50 rounded-lg">
                    <div className="bg-gray-100 p-1 md:p-1.5 rounded-full flex-shrink-0">
                      <feature.icon className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-700 text-xs md:text-base responsive-text truncate">{feature.name}</div>
                      <div className="text-xs md:text-sm text-gray-500 responsive-text">{feature.free}</div>
                    </div>
                    <X className="w-4 h-4 md:w-5 md:h-5 text-gray-400 flex-shrink-0" />
                  </div>
                ))}
                <div className="pt-3 md:pt-5 text-center">
                  <p className="text-gray-500 text-xs md:text-sm mt-2 responsive-text">
                    Limited features • Basic support
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="text-center mt-6 md:mt-10 mb-3 md:mb-5">
          <p className="text-white/80 text-xs md:text-sm mb-2 md:mb-3 responsive-text">
            ✨ Join 10,000+ happy premium members
          </p>
          <div className="flex flex-wrap justify-center items-center gap-2 md:gap-5 text-white/60">
            <span className="text-xs">🔒 SSL Secured</span>
            <span className="text-xs">💳 Safe Payments</span>
            <span className="text-xs">📱 Mobile Optimized</span>
          </div>
        </div>
      </div>

      {/* Payment Type Selection Modal */}
      {showPaymentOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-2 sm:px-4">
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-md relative">
            <button 
              onClick={() => setShowPaymentOptions(false)} 
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold mb-4 text-center">
              {isIOS() && isNativeApp() ? 'Subscribe via In-App Purchase' : 'Choose Payment Option'}
            </h2>
            <div className="space-y-4">
              {/* Apple IAP - show on iOS native when available */}
              {isIOS() && isNativeApp() && canBuy && (
                <button
                  onClick={() => handlePaymentTypeSelection('iap')}
                  disabled={iapLoading}
                  className="w-full p-4 bg-gradient-to-r from-gray-800 to-black text-white rounded-lg hover:from-gray-700 hover:to-gray-900 transition-all duration-200 font-semibold disabled:opacity-50"
                >
                  <div className="text-lg">🍎 {iapLoading ? 'Processing...' : 'Subscribe Now'}</div>
                  <div className="text-sm opacity-90">In-App Purchase • Secure & Fast</div>
                </button>
              )}
              
              {/* Loading message when IAP is not ready on iOS */}
              {isIOS() && isNativeApp() && !canBuy && !iapLoadingTimeout && (
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-blue-600 mb-2">⏳ In-App Purchase is loading...</div>
                  <div className="text-sm text-blue-500">Please wait a moment while we connect to the App Store.</div>
                  <div className="text-xs text-gray-500 mt-2">This usually takes 2-5 seconds...</div>
                </div>
              )}
              
              {/* Error message when IAP failed to load on iOS */}
              {isIOS() && isNativeApp() && !canBuy && iapLoadingTimeout && (
                <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-red-600 mb-2 font-semibold">⚠️ App Store Connection Failed</div>
                  <div className="text-sm text-red-500 mb-3">
                    Unable to load in-app purchases. This usually happens when:
                  </div>
                  <div className="text-xs text-left text-gray-600 mb-3 space-y-1">
                    <div>• Running on a real device without sandbox tester</div>
                    <div>• No internet connection to App Store</div>
                    <div>• Product not set up in App Store Connect</div>
                    <div>• Using a production build in testing</div>
                  </div>
                  <div className="text-xs text-blue-600 mb-3 bg-blue-50 p-2 rounded border border-blue-200">
                    💡 <strong>Real Device Testing:</strong><br/>
                    Sign out of Apple ID → Settings → App Store → Sandbox Account
                  </div>
                  <button
                    onClick={() => {
                      setIapLoadingTimeout(false);
                      setShowPaymentOptions(false);
                      window.location.reload();
                    }}
                    className="w-full p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 font-semibold"
                  >
                    🔄 Retry Connection
                  </button>
                </div>
              )}
              
              {/* Show Paystack options ONLY on non-iOS platforms */}
              {!isIOS() && !isNativeApp() && (
                <>
                  <button
                    onClick={() => handlePaymentTypeSelection('subscription')}
                    className="w-full p-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 font-semibold"
                  >
                    <div className="text-lg">💳 Subscribe Monthly</div>
                    <div className="text-sm opacity-90">{currency} {monthlyPrice || price}/month • Cancel anytime</div>
                  </button>
                  <button
                    onClick={() => handlePaymentTypeSelection('one-time')}
                    className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-semibold"
                  >
                    <div className="text-lg">📱 One-Time Payment</div>
                    <div className="text-sm opacity-90">{price !== null ? `${currency} ${price}` : 'Loading...'} • 1 month access • No auto-renewal</div>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modals - Only render on non-iOS platforms */}
      {!isIOS() && !isNativeApp() && (
        <PaystackPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          amount={parseFloat(paymentType === 'one-time' ? (price || '0') : (monthlyPrice || price || '0'))}
          currency={currency}
          email={currentUser?.email || ''}
          onSuccess={handlePaymentSuccess}
          paymentMethod={paymentMethods[0]?.type || 'card'}
          isOneTime={paymentType === 'one-time'}
        />
      )}
    </div>
  );
};

export default PremiumUpgrade;
