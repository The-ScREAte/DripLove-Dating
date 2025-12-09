
import React, { useState } from 'react';
import PaystackPaymentModal from './PaystackPaymentModal';
import { getPremiumPaymentConfig } from '@/utils/paymentConfig';
import { isIOS, isNativeApp } from '@/utils/iap';
import { buyMonthly, debugIAPState, restorePurchases } from '../iap';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Heart, RotateCcw, Users, Check, X, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedSubscription } from '@/hooks/useEnhancedSubscription';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';

interface PremiumUpgradeProps {
  currentUser: any;
  onClose?: () => void;
  preselectedPlan?: 'premium';
}

const PremiumUpgrade = ({ currentUser, onClose, preselectedPlan }: PremiumUpgradeProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [paymentType, setPaymentType] = useState<'subscription' | 'one-time' | 'iap' | null>(null);
  const [iapLoading, setIapLoading] = useState(false);
  const [canBuy, setCanBuy] = useState(false);
  const [iapLoadingTimeout, setIapLoadingTimeout] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  
  // Enhanced subscription status monitoring
  const { subscriptionStatus, isPremium, loading: subscriptionLoading, refetch: refetchSubscription } = useEnhancedSubscription();

  React.useEffect(() => {
    // Listen for productUpdated to enable the in-app purchase button
    function onProductUpdated(p?: any) {
      // @ts-ignore
      const store = window.CdvPurchase?.store;
      
      // Check for both possible product IDs
      const product2 = store?.get?.('com.driplove.dating.premium.monthlysub2');
      const product3 = store?.get?.('com.driplove.dating.premium.monthlysub3');
      const product = product3 || product2; // Prefer monthlysub3, fallback to monthlysub2
      
      console.log('[PremiumUpgrade] Products from store:', {
        monthlysub2: product2,
        monthlysub3: product3,
        selected: product?.id
      });
      
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
      // Check for both product IDs
      const isOurProduct = r?.productId === 'com.driplove.dating.premium.monthlysub2' || 
                           r?.productId === 'com.driplove.dating.premium.monthlysub3';
      if (isOurProduct) {
        setIapLoading(false);
        setShowPaymentOptions(false);
      }
    }
    
    // Listen for unverified purchases (includes cancellations)
    function onUnverified(r?: any, err?: any) {
      // Check for both product IDs
      const isOurProduct = r?.productId === 'com.driplove.dating.premium.monthlysub2' || 
                           r?.productId === 'com.driplove.dating.premium.monthlysub3';
      if (isOurProduct) {
        setIapLoading(false);
        toast({
          title: 'Purchase cancelled',
          description: '',
        });
      }
    }
    
    // Listen for errors (includes user cancellations)
    function onError(e?: any) {
      // User cancellation typically has specific error codes
      if (e?.code === 'UserCancel' || e?.code === 2 || e?.message?.toLowerCase()?.includes('cancel')) {
        setIapLoading(false);
        toast({
          title: 'Purchase cancelled',
          description: '',
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
        // Silently handle timeout without showing toast
      }
    }, 8000); // 8 seconds timeout for better UX
    
    // Cleanup
    return () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
    // No off/unsubscribe in plugin
  }, [toast]);
  
  const [price, setPrice] = useState<string | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [ghsPrice, setGhsPrice] = useState<string | null>(null);
  
  // USD to GHS exchange rate (update this periodically)
  const USD_TO_GHS_RATE = 16.5;

  React.useEffect(() => {
    const loadPaymentConfig = async () => {
      const config = await getPremiumPaymentConfig();
      
      // Always use international pricing (USD) for display
      const selectedCurrency = config.defaultInternationalCurrency || 'USD';
      const usdPrice = config.defaultInternationalPrice || '1.99';
      
      // Convert USD to GHS for Paystack
      const ghsAmount = (parseFloat(usdPrice) * USD_TO_GHS_RATE).toFixed(2);

      setPrice(usdPrice);
      setMonthlyPrice(usdPrice);
      setGhsPrice(ghsAmount);
      setPaymentMethods(config.paymentMethods);
      setCurrency(selectedCurrency);
      
      console.log('[PremiumUpgrade] Loaded pricing:', {
        usdPrice,
        ghsPrice: ghsAmount,
        exchangeRate: USD_TO_GHS_RATE
      });
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
        title: 'Connection Failed',
        description: 'Please try again later.',
        variant: 'destructive',
      });
      return;
    }
    
    // Always show payment options - let user choose
    setShowPaymentOptions(true);
  };

  const handlePaymentTypeSelection = async (type: 'subscription' | 'one-time' | 'iap') => {
    if (type === 'iap') {
      if (!canBuy) {
        // Silently prevent action if not ready
        return;
      }
      setIapLoading(true);
      const timeoutId = setTimeout(() => {
        setIapLoading(false);
        toast({
          title: 'Request timeout',
          description: 'The payment request is taking longer than expected. Please try again.',
        });
      }, 30000);
      try {
        await buyMonthly();
        clearTimeout(timeoutId);
        // Success: let the purchase flow complete
      } catch (err: any) {
        clearTimeout(timeoutId);
        setIapLoading(false);
        
        // Check if it's a user cancellation (don't show error for that)
        const isCancellation = err?.message?.toLowerCase().includes('cancel') || 
                              err?.code === 'UserCancel' || 
                              err?.code === 2;
        
        if (!isCancellation) {
          toast({
            title: 'Unable to complete purchase',
            description: 'Please check your connection and try again.',
          });
        }
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

  const handleRestorePurchases = async () => {
    setRestoreLoading(true);
    try {
      console.log('[PremiumUpgrade] Starting restore purchases...');
      
      // Call the restore function and wait for it to complete
      await restorePurchases();
      
      // Give it an additional moment to process any receipt validations
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('[PremiumUpgrade] Restore completed, refreshing subscription status...');
      
      // Refetch subscription status
      await refetchSubscription();
      
      console.log('[PremiumUpgrade] Subscription status refreshed');
      
      toast({
        title: 'Restore Complete',
        description: 'If you had an active subscription, it has been restored.',
      });
    } catch (error) {
      console.error('[PremiumUpgrade] Restore error:', error);
      toast({
        title: 'Restore Failed',
        description: 'Unable to restore purchases. Please ensure you have an active subscription and try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  const features = [
    { name: t('premium.features.unlimitedSwipes.name'), free: t('premium.features.unlimitedSwipes.free'), premium: t('premium.features.unlimitedSwipes.premium'), icon: Heart },
    { name: t('premium.features.reverseDislikes.name'), free: t('premium.features.reverseDislikes.free'), premium: t('premium.features.reverseDislikes.premium'), icon: RotateCcw },
    { name: t('premium.features.adFrequency.name'), free: t('premium.features.adFrequency.free'), premium: t('premium.features.adFrequency.premium'), icon: X },
    { name: t('premium.features.seeWhoLiked.name'), free: t('premium.features.seeWhoLiked.free'), premium: t('premium.features.seeWhoLiked.premium'), icon: Users },
    { name: t('premium.features.unlockCountries.name'), free: t('premium.features.unlockCountries.free'), premium: t('premium.features.unlockCountries.premium'), icon: Globe },
    { name: t('premium.features.prioritySupport.name'), free: t('premium.features.prioritySupport.free'), premium: t('premium.features.prioritySupport.premium'), icon: Crown },
  ];

  return (
  <div
    className="h-full w-full bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700 overflow-y-auto"
    style={{
      // Use clamp to respect the device safe-area inset while keeping
      // a reasonable minimum and maximum top padding for notched devices.
      paddingTop: 'clamp(16px, env(safe-area-inset-top, 0px), 28px)',
      // Keep the responsive horizontal padding via remaining classes on inner container
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      minHeight: '100%',
      position: 'relative'
    }}
  >
      <div
        className="max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto px-0 sm:px-2 md:px-4 lg:px-6"
        style={{
          // Ensure there is enough bottom padding on devices with a home indicator
          paddingBottom: Capacitor.getPlatform() === 'web'
            ? '120px'
            : 'clamp(120px, calc(env(safe-area-inset-bottom, 10px) + 120px), 150px)'
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
            {t('premium.back')}
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
                  {t('premium.mostPopular')}
                </div>
              
              <CardHeader className="text-center pb-3 md:pb-5 pt-4 md:pt-7 px-2 md:px-4">
                <CardTitle className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold flex items-center justify-center text-gray-800 responsive-text">
                  <Crown className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 text-yellow-500 mr-2 sm:mr-3" />
                  {t('premium.premiumPlan')}
                </CardTitle>
                <div className="mt-2 md:mt-3">
                  <div className="space-y-2 md:space-y-3">
                    {/* Monthly payment option */}
                    {monthlyPrice && (
                      <div className="p-2 md:p-3 bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-lg">
                        <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 responsive-text">
                          ${monthlyPrice}/month
                        </div>
                        <div className="text-xs md:text-sm text-blue-600 font-medium mt-1">📱 {t('premium.monthlySubscription')}</div>
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
                    <div className="font-semibold text-gray-800 text-xs md:text-base responsive-text truncate">{t('premium.features.allFutureFeatures.name')}</div>
                    <div className="text-xs md:text-sm text-green-600 font-medium responsive-text">{t('premium.features.allFutureFeatures.premium')}</div>
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
                    {t('premium.upgradeButton')}
                  </Button>
                  
                  {/* Restore Purchases Link for iOS */}
                  {isIOS() && isNativeApp() && (
                    <button
                      onClick={handleRestorePurchases}
                      disabled={restoreLoading}
                      className="mt-3 text-xs md:text-sm text-gray-600 hover:text-gray-800 underline disabled:opacity-50 transition-colors"
                    >
                      {restoreLoading ? t('premium.restoringPurchases') : t('premium.restorePurchases')}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Free Plan */}
          <div className="order-2 md:order-2 w-full">
            <Card className="border-2 border-gray-200 shadow-md bg-white relative transition-all duration-300 w-full">
              <CardHeader className="text-center pb-3 md:pb-5 px-2 md:px-4">
                <CardTitle className="text-lg sm:text-xl md:text-2xl font-bold text-gray-700 responsive-text">{t('premium.freePlan')}</CardTitle>
                <div className="mt-2 md:mt-3">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-700 responsive-text">{currency} 0</div>
                  <div className="text-xs md:text-sm text-gray-500 mt-1">{t('premium.basicFeaturesOnly')}</div>
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
                    {t('premium.limitedFeatures')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="text-center mt-6 md:mt-10 mb-3 md:mb-5">
          <p className="text-white/80 text-xs md:text-sm mb-2 md:mb-3 responsive-text">
            {t('premium.trustIndicators.joinMembers')}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-2 md:gap-5 text-white/60">
            <span className="text-xs">{t('premium.trustIndicators.sslSecured')}</span>
            <span className="text-xs">{t('premium.trustIndicators.safePayments')}</span>
            <span className="text-xs">{t('premium.trustIndicators.mobileOptimized')}</span>
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
              {t('premium.paymentOptions.title')}
            </h2>
            <div className="space-y-4">
              {/* Apple IAP - show on iOS native when available */}
              {isIOS() && isNativeApp() && canBuy && (
                <>
                  <button
                    onClick={() => handlePaymentTypeSelection('iap')}
                    disabled={iapLoading}
                    className="w-full p-4 bg-gradient-to-r from-gray-800 to-black text-white rounded-lg hover:from-gray-700 hover:to-gray-900 transition-all duration-200 font-semibold disabled:opacity-50"
                  >
                    <div className="text-lg">{iapLoading ? t('premium.paymentOptions.iap.processing') : t('premium.paymentOptions.iap.button')}</div>
                    <div className="text-sm opacity-90">{t('premium.paymentOptions.iap.subtitle')}</div>
                  </button>
                  
                  {/* Auto-renewal disclosure */}
                  <div className="text-xs text-gray-600 text-center px-2 -mt-2">
                    {t('premium.paymentOptions.iap.disclosure')}
                  </div>
                </>
              )}
              
              {/* Loading message when IAP is not ready on iOS */}
              {isIOS() && isNativeApp() && !canBuy && !iapLoadingTimeout && (
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-blue-600 mb-2 font-semibold">{t('premium.paymentOptions.loading.title')}</div>
                  <div className="text-sm text-blue-500">{t('premium.paymentOptions.loading.message')}</div>
                </div>
              )}
              {isIOS() && isNativeApp() && !canBuy && iapLoadingTimeout && (
                <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-amber-800 mb-2 font-semibold">{t('premium.paymentOptions.unavailable.title')}</div>
                  <div className="text-sm text-amber-700">
                    {t('premium.paymentOptions.unavailable.message')}
                  </div>
                </div>
              )}
              
              {/* Paystack/Card Payment Options - show on web and Android only, NOT on iOS */}
              {!(isIOS() && isNativeApp()) && (
                <button
                  onClick={() => handlePaymentTypeSelection('subscription')}
                  className="w-full p-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 font-semibold"
                >
                  <div className="text-lg">{t('premium.paymentOptions.monthly.button')}</div>
                  <div className="text-sm opacity-90">${monthlyPrice}/month • {t('premium.paymentOptions.monthly.subtitle')}</div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modals - Show on Web and Android (non-iOS platforms) */}
      {(!isIOS() || !isNativeApp()) && (
        <PaystackPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          amount={parseFloat(ghsPrice || '0')}
          currency="GHS"
          displayAmount={parseFloat(monthlyPrice || '0')}
          displayCurrency="USD"
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
