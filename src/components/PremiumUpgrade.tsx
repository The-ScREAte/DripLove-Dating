
import React, { useCallback, useMemo, useRef, useState } from 'react';
import PaystackPaymentModal from './PaystackPaymentModal';
import { isIOS, isNativeApp } from '@/utils/iap';
import { buyMonthly, debugIAPState, restorePurchases } from '../iap';
import { buyGoogleMonthly, canUseGoogleIAP, restoreGooglePurchases, isAndroid, getGoogleProducts } from '../iap-google';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Heart, RotateCcw, Users, Check, X, Globe, CheckCircle, Sparkles, ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedSubscription } from '@/hooks/useEnhancedSubscription';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { convertCurrency } from '@/services/exchangeRateService';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
 
type TimeoutHandle = ReturnType<typeof setTimeout>

type CdvStoreProduct = {
  owned?: boolean
  getOffer?: () => unknown
  title?: string
  description?: string
}

type CdvStoreWhen = {
  productUpdated: (cb: () => void) => CdvStoreWhen
  verified: (cb: (r?: unknown) => void) => CdvStoreWhen
  unverified: (cb: (r?: unknown) => void) => CdvStoreWhen
}

type CdvStore = {
  get?: (id: string) => CdvStoreProduct | undefined
  when?: () => CdvStoreWhen
  error?: (cb: (e?: unknown) => void) => void
}

function getCdvStore(): CdvStore | undefined {
  return (window as unknown as { CdvPurchase?: { store?: CdvStore } }).CdvPurchase?.store
}

function isFlagEnabled(flagName: 'iapInitializationFailed' | 'googleIapInitializationFailed'): boolean {
  const flags = window as unknown as {
    iapInitializationFailed?: boolean
    googleIapInitializationFailed?: boolean
  }
  return flags[flagName] === true
}

function isCancellationError(err: unknown): boolean {
  const message =
    typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? ((err as { message: string }).message || '').toLowerCase()
      : ''

  const code =
    typeof err === 'object' && err && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined

  return message.includes('cancel') || code === 'UserCancel' || code === 2
}

function getProductId(value: unknown): string | undefined {
  if (typeof value !== 'object' || !value) return undefined
  if (!('productId' in value)) return undefined
  const productId = (value as { productId?: unknown }).productId
  return typeof productId === 'string' ? productId : undefined
}

interface PremiumUpgradeProps {
  currentUser: ({ id?: string | null; email?: string | null } & Record<string, unknown>);
  onClose?: () => void;
  preselectedPlan?: 'premium';
}

const PremiumUpgrade = ({ currentUser, onClose, preselectedPlan }: PremiumUpgradeProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [paymentType, setPaymentType] = useState<'subscription' | 'one-time' | 'iap' | 'google_iap' | null>(null);
  const [iapLoading, setIapLoading] = useState(false);
  const [canBuy, setCanBuy] = useState(false);
  const [iapLoadingTimeout, setIapLoadingTimeout] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  
  // Google IAP state
  const [canBuyGoogle, setCanBuyGoogle] = useState(false);
  const [googleIapLoading, setGoogleIapLoading] = useState(false);
  const [googleIapLoadingTimeout, setGoogleIapLoadingTimeout] = useState(false);
  const [googlePrice, setGooglePrice] = useState<string | null>(null);
  const canBuyRef = useRef(canBuy);
  const googleCanBuyRef = useRef(canBuyGoogle);
  React.useEffect(() => {
    canBuyRef.current = canBuy;
  }, [canBuy]);

  React.useEffect(() => {
    googleCanBuyRef.current = canBuyGoogle;
  }, [canBuyGoogle]);
  
  // Enhanced subscription status monitoring
  const { subscriptionStatus, isPremium, loading: subscriptionLoading, refetch: refetchSubscription } = useEnhancedSubscription();
  // Read inside the long-lived IAP store listener below via a ref, same pattern
  // as canBuyRef/googleCanBuyRef, since that effect only runs once on mount.
  const refetchSubscriptionRef = useRef(refetchSubscription);
  React.useEffect(() => {
    refetchSubscriptionRef.current = refetchSubscription;
  }, [refetchSubscription]);

  const deviceIsNative = isNativeApp();
  const deviceIsAndroid = isAndroid();
  const deviceIsIos = isIOS();
  const isAndroidNative = deviceIsAndroid && deviceIsNative;
  const isIosNative = deviceIsIos && deviceIsNative;
  const showRestoreButton = (deviceIsIos || deviceIsAndroid) && deviceIsNative;
  // Paystack shows on ALL web (any OS, including an iPhone's mobile
  // browser - isIOS() matches on user-agent too, not just native platform,
  // and a browser never has Apple/Google IAP available regardless of OS).
  // Temporarily disabled on the Android native app only - Google Play
  // Billing (IAP) is the sole payment path there for now.
  const showPaystackOption = !deviceIsNative;
  // No payment method matched any of the blocks below at all - a real device
  // reaching this is always a bug (every device falls into exactly one
  // matrix cell above), not a legitimate "nothing to show" state. Root cause
  // seen in practice: Capacitor.isNativePlatform() (isNativeApp() above) can
  // still read false for a moment while the native bridge finishes setting
  // up, since it has no async/ready signal to await - deviceIsNative/
  // isIosNative/isAndroidNative are recomputed fresh every render, so a
  // forced re-render shortly after mount (below) usually self-corrects it
  // before this ever gets seen. This stays as a safety net for any other way
  // that gap could show up, so the modal can never render visibly empty.
  const noPaymentMethodMatched = !(isIosNative || isAndroidNative || showPaystackOption);
  const [nativeCheckTick, setNativeCheckTick] = useState(0);
  React.useEffect(() => {
    const timer = setTimeout(() => setNativeCheckTick((v) => v + 1), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  void nativeCheckTick;

  React.useEffect(() => {
    const productUpdateTimeouts: TimeoutHandle[] = [];

    function onProductUpdated() {
      const store = getCdvStore();

      const product2 = store?.get?.('com.driplove.dating.premium.monthlysub2');
      const product3 = store?.get?.('com.driplove.dating.premium.monthlysub3');
      const product = product3 || product2;

      const hasOffer = !!product?.getOffer?.();
      setCanBuy(hasOffer);

      if (hasOffer) {
        setIapLoadingTimeout(false);
      }

      if (isFlagEnabled('iapInitializationFailed') && !hasOffer) {
        setIapLoadingTimeout(true);
        setCanBuy(false);
      }
    }

    function onVerified(r?: unknown) {
      const productId = getProductId(r)
      const isOurProduct = productId === 'com.driplove.dating.premium.monthlysub2' ||
        productId === 'com.driplove.dating.premium.monthlysub3' ||
        productId === 'premium_monthly';
      if (isOurProduct) {
        // Covers both Apple and Google purchases - previously only reset the
        // Apple loading flag, so a real successful Google Play purchase left
        // the "Processing..." spinner stuck on and the modal open until the
        // user manually dismissed it.
        setIapLoading(false);
        setGoogleIapLoading(false);
        setShowPaymentOptions(false);
        // The receipt/purchase validator (iap-receipt-validator or
        // google-iap-validator) writes user_subscriptions under the service
        // role, which useEnhancedSubscription's 5-minute poll would
        // eventually pick up on its own - refetch immediately instead so the
        // premium gate flips right away rather than staying stale.
        refetchSubscriptionRef.current?.();
      }
    }

    function onUnverified(r?: unknown) {
      const productId = getProductId(r)
      const isOurProduct = productId === 'com.driplove.dating.premium.monthlysub2' ||
        productId === 'com.driplove.dating.premium.monthlysub3';
      if (isOurProduct) {
        setIapLoading(false);
        toast({
          title: 'Purchase cancelled',
          description: '',
        });
      }
    }

    function onError(e?: unknown) {
      if (isCancellationError(e)) {
        setIapLoading(false);
        toast({
          title: 'Purchase cancelled',
          description: '',
        });
      }
    }

    const store = getCdvStore();
    if (store && store.when && typeof store.when === 'function') {
      try {
        store.when()
          .productUpdated(onProductUpdated)
          .verified(onVerified)
          .unverified(onUnverified);
      } catch (error) {
        console.warn('[UI] Error setting up IAP listeners:', error);
      }
    }

    if (store && store.error && typeof store.error === 'function') {
      try {
        store.error(onError);
      } catch (error) {
        console.warn('[UI] Error setting up global error listener:', error);
      }
    }

    onProductUpdated();
    productUpdateTimeouts.push(setTimeout(onProductUpdated, 1000));

    const loadingTimeout = setTimeout(() => {
      if (!canBuyRef.current) {
        console.warn('[UI] IAP loading timeout - products not available after 8 seconds');
        setIapLoadingTimeout(true);
      }
    }, 8000);

    return () => {
      productUpdateTimeouts.forEach(clearTimeout);
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
    // No off/unsubscribe in plugin
  }, [toast]);
  
  // Google IAP initialization effect
  React.useEffect(() => {
    if (!isAndroidNative) return;

    const timeouts: TimeoutHandle[] = [];

    const checkGoogleIAP = async () => {
      // Check every candidate product ID (matches the selection logic used
      // everywhere else - iap-google.ts's buyGoogleMonthly, useFreeTrialOffer)
      // instead of only 'premium_monthly' - if Play Console's live product
      // id is one of the other candidates, checking just this one hardcoded
      // id left canBuyGoogle permanently false and the Subscribe button
      // permanently disabled, even once billing was actually ready.
      const hasOffer = canUseGoogleIAP();
      setCanBuyGoogle(hasOffer);

      if (hasOffer) {
        setGoogleIapLoadingTimeout(false);
        const products = await getGoogleProducts();
        if (products) {
          setGooglePrice(products.price);
        }
      }

      if (isFlagEnabled('googleIapInitializationFailed') && !hasOffer) {
        setGoogleIapLoadingTimeout(true);
        setCanBuyGoogle(false);
      }
    };

    checkGoogleIAP();
    timeouts.push(setTimeout(checkGoogleIAP, 1000));
    timeouts.push(setTimeout(checkGoogleIAP, 3000));

    const loadingTimeout = setTimeout(() => {
      if (!googleCanBuyRef.current) {
        setGoogleIapLoadingTimeout(true);
      }
    }, 8000);

    return () => {
      timeouts.forEach(clearTimeout);
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
  }, [isAndroidNative]);
  
  // Use pricing config hook - now fetches localized IAP prices directly
  // Pass currentUser.id for country-specific pricing from DB
  const pricingConfig = usePricingConfig(currentUser?.id);
  const { eligibleForTrial: pageTrialEligible, offerInfo: pageTrialOfferInfo } = useFreeTrialOffer(currentUser?.id);
  
  // Extract pricing info - displayPrice contains the full localized price from IAP
  const displayPrice = pricingConfig.displayPrice; // e.g., "$4.99", "₵39.99", "₦4,499"
  const monthlyPrice = pricingConfig.monthlyPrice;
  const currency = pricingConfig.currency;
  const currencySymbol = pricingConfig.currencySymbol;
  const ghsPrice = pricingConfig.ghsPrice;
  
  // Paystack pricing (special case):
  // Primary = DB "default international" price (USD) from Admin → converted to GHS via exchange-rate API.
  // Fallback (Android only) = Android localized pricing (Google Play) + its precomputed GHS conversion.
  const defaultInternationalPrice = pricingConfig.defaultInternationalPrice;
  const defaultInternationalCurrency = pricingConfig.defaultInternationalCurrency;

  const [paystackGhsAmount, setPaystackGhsAmount] = useState<number | null>(null);
  const [paystackUseAndroidFallback, setPaystackUseAndroidFallback] = useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const computePaystackAmount = async () => {
      setPaystackUseAndroidFallback(false);
      setPaystackGhsAmount(null);

      const baseAmount = parseFloat(defaultInternationalPrice || '0');
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        // If DB price is missing/invalid, fall back to existing behavior.
        setPaystackUseAndroidFallback(true);
        setPaystackGhsAmount(null);
        return;
      }

      // Convert DB price → GHS using exchange-rate API (no approximate fallback here).
      const converted = await convertCurrency(baseAmount, (defaultInternationalCurrency || 'USD').toUpperCase(), 'GHS');
      if (cancelled) return;

      if (converted === null) {
        setPaystackUseAndroidFallback(true);
        setPaystackGhsAmount(null);
        return;
      }

      // Keep consistent with existing Paystack flow which uses whole GHS for amounts.
      setPaystackGhsAmount(Math.round(converted));
    };

    computePaystackAmount();
    return () => {
      cancelled = true;
    };
  }, [defaultInternationalPrice, defaultInternationalCurrency]);

  const paystackDisplayCurrency = paystackUseAndroidFallback && isAndroidNative ? currency : 'USD';
  const paystackDisplayAmount = paystackUseAndroidFallback && isAndroidNative
    ? parseFloat(monthlyPrice)
    : parseFloat(defaultInternationalPrice);

  const paystackChargedGhsAmount = paystackGhsAmount !== null
    ? paystackGhsAmount
    : (paystackUseAndroidFallback && isAndroidNative ? parseFloat(ghsPrice) : parseFloat(ghsPrice));

  const paystackButtonSubtitle = (() => {
    if (paystackUseAndroidFallback && isAndroidNative) {
      // Localized pricing fallback
      return `${currencySymbol}${monthlyPrice}/month • ${t('premium.paymentOptions.monthly.subtitle')}`;
    }
    // Primary DB USD pricing
    return `$${defaultInternationalPrice}/month • ${t('premium.paymentOptions.monthly.subtitle')}`;
  })();
  
  const [paymentMethods, setPaymentMethods] = useState<Array<{ type: 'iap' | 'card' | 'momo' }>>([{ type: 'card' }]);

  const handleUpgrade = () => {
    // Don't allow upgrade if price is still loading
    if (pricingConfig.loading) {
      toast({
        title: 'Loading...',
        description: 'Please wait while we load pricing information.',
      });
      return;
    }
    
    // Check if we're on iOS and IAP initialization has failed
    if (isIosNative && isFlagEnabled('iapInitializationFailed')) {
      toast({
        title: 'Connection Failed',
        description: 'Please try again later.',
        variant: 'destructive',
      });
      return;
    }
    
    // Both iOS and Android native now have exactly one real purchase path
    // each (Apple IAP; Google Play Billing, since Paystack is disabled on
    // Android for now) - skip the intermediate "Choose Payment Option"
    // modal and go straight to the native purchase sheet, which already
    // shows the trial (or charge) correctly on its own. Only web still
    // shows the modal, since it has a real choice to present (Paystack/card
    // being the only option there doesn't change that it's still a
    // separate, non-native checkout flow worth confirming first).
    if (isIosNative && canBuy) {
      handlePaymentTypeSelection('iap');
      return;
    }
    if (isAndroidNative && canBuyGoogle) {
      handlePaymentTypeSelection('google_iap');
      return;
    }

    setShowPaymentOptions(true);
  };

  const handlePaymentTypeSelection = useCallback(async (type: 'subscription' | 'one-time' | 'iap' | 'google_iap') => {
    if (type === 'iap') {
      if (!canBuy) {
        // Silently prevent action if not ready
        return;
      }
      setIapLoading(true);
      // Increased timeout to 3 minutes for slower connections/payment processing
      const timeoutId = setTimeout(() => {
        setIapLoading(false);
        toast({
          title: 'Request timeout',
          description: 'The payment request is taking longer than expected. Please try again.',
        });
      }, 180000);
      try {
        await buyMonthly();
        clearTimeout(timeoutId);
        // Success: let the purchase flow complete
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        setIapLoading(false);

        if (!isCancellationError(err)) {
          toast({
            title: 'Unable to complete purchase',
            description: 'Please check your connection and try again.',
          });
        }
      }
    } else if (type === 'google_iap') {
      if (!canBuyGoogle) {
        return;
      }
      setGoogleIapLoading(true);
      // Increased timeout to 3 minutes for slower connections/payment processing
      const timeoutId = setTimeout(() => {
        toast({
          title: 'Still waiting for Google Play',
          description: 'If you are still on the Google Play payment screen, please finish the purchase. Do not retry unless Google Play shows an error.',
        });
      }, 180000);
      try {
        await buyGoogleMonthly();
        clearTimeout(timeoutId);
        // Success: let the purchase flow complete
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        setGoogleIapLoading(false);

        if (!isCancellationError(err)) {
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
  }, [canBuy, canBuyGoogle, toast]);

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
      // Start restore purchases
      // Call the appropriate restore function based on platform with timeout protection
      let restoreResult: { restored: boolean; message: string };
      
      const restorePromise = isAndroidNative 
        ? restoreGooglePurchases() 
        : restorePurchases();
      
      // Add timeout protection for the restore operation. The underlying
      // restore functions already have their own ~30s safety timeout with a
      // real, correctly-worded result -- this outer timeout is only a last
      // resort in case that promise never settles at all, so it's set just
      // above that to let the inner timeout win first in the normal case.
      const timeoutPromise = new Promise<{ restored: boolean; message: string }>((_, reject) => {
        setTimeout(() => reject(new Error('Restore timeout')), 35000);
      });
      
      try {
        restoreResult = await Promise.race([restorePromise, timeoutPromise]);
      } catch (timeoutError) {
        // On timeout, check the database directly
        await refetchSubscription();
        // Small delay for refetch to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if subscription is now active
        const { data: subData } = await supabase
          .from('user_subscriptions')
          .select('status, expires_at')
          .eq('user_id', currentUser?.id)
          .maybeSingle();
        
        if (subData?.status === 'active' && new Date(subData.expires_at) > new Date()) {
          restoreResult = { restored: true, message: 'Subscription restored successfully' };
        } else {
          restoreResult = { restored: false, message: 'No active subscription found' };
        }
      }
      
      // Refetch subscription status
      await refetchSubscription();
      
      if (restoreResult.restored) {
        // Successfully restored - redirect to success page
        toast({
          title: (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-500" /> Subscription Restored
            </span>
          ),
          description: 'Redirecting to your premium account...',
        });
        // Small delay for toast to show
        setTimeout(() => {
          window.location.href = '/payment-success?status=successful&payment_type=restore';
        }, 1000);
        return; // Don't set loading to false since we're redirecting
      } else {
        // No subscription found to restore - show the message from restore result
        toast({
          title: 'No Purchase Found',
          description: restoreResult.message || 'No active subscription found. If you previously purchased, it may have expired.',
          variant: 'destructive',
        });
      }
    } catch (error: unknown) {
      console.error('[PremiumUpgrade] Restore error:', error);
      
      // Even on error, check if subscription is actually active
      try {
        const { data: subData } = await supabase
          .from('user_subscriptions')
          .select('status, expires_at')
          .eq('user_id', currentUser?.id)
          .maybeSingle();
        
        if (subData?.status === 'active' && new Date(subData.expires_at) > new Date()) {
          toast({
            title: (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-500" /> Subscription Active
            </span>
          ),
            description: 'Your subscription is active. Redirecting...',
          });
          setTimeout(() => {
            window.location.href = '/payment-success?status=successful&payment_type=restore';
          }, 1000);
          return;
        }
      } catch (dbError) {
        console.error('[PremiumUpgrade] Error checking subscription:', dbError);
      }
      
      toast({
        title: 'Restore Failed',
        description: 'Unable to restore purchases. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  const features = useMemo(() => [
    { name: t('premium.features.unlimitedSwipes.name'), free: t('premium.features.unlimitedSwipes.free'), premium: t('premium.features.unlimitedSwipes.premium'), icon: Heart },
    { name: t('premium.features.reverseDislikes.name'), free: t('premium.features.reverseDislikes.free'), premium: t('premium.features.reverseDislikes.premium'), icon: RotateCcw },
    { name: t('premium.features.seeWhoLiked.name'), free: t('premium.features.seeWhoLiked.free'), premium: t('premium.features.seeWhoLiked.premium'), icon: Users },
    { name: t('premium.features.unlockCountries.name'), free: t('premium.features.unlockCountries.free'), premium: t('premium.features.unlockCountries.premium'), icon: Globe },
    { name: t('premium.features.adFrequency.name'), free: t('premium.features.adFrequency.free'), premium: t('premium.features.adFrequency.premium'), icon: X },
    { name: t('premium.features.prioritySupport.name'), free: t('premium.features.prioritySupport.free'), premium: t('premium.features.prioritySupport.premium'), icon: Crown },
  ], [t]);

  // Defense-in-depth: every screen that opens this component already checks
  // isPremium before doing so, but this component's own isPremium could still
  // flip true *while mounted* - right after a purchase completes (via the
  // refetch above) or after the stale-state window closes on its own. Without
  // this, a user could sit on the purchase screen and tap an option again
  // during that window. Once premium is confirmed, show that instead of ever
  // rendering the payment options again.
  if (!subscriptionLoading && isPremium && !showPaymentModal) {
    return (
      <div
        className="h-full w-full flex items-center justify-center overflow-y-auto px-4"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(20,10,20,0.92))',
          paddingTop: 'clamp(16px, env(safe-area-inset-top, 0px), 28px)',
          minHeight: '100%',
        }}
      >
        <div className="max-w-sm w-full text-center py-10">
          <Crown className="w-14 h-14 mx-auto mb-4 text-yellow-400" />
          <h2 className="text-xl font-bold text-white mb-2">
            {t('premium.alreadyPremium.title', "You're Already Premium!")}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {subscriptionStatus?.expires_at
              ? t('premium.alreadyPremium.subtitleWithDate', 'Your plan is active until {{date}}.', {
                  date: new Date(subscriptionStatus.expires_at).toLocaleDateString(),
                })
              : t('premium.alreadyPremium.subtitle', 'Your plan is active - enjoy all the premium features.')}
          </p>
          <Button
            onClick={() => (onClose ? onClose() : window.history.back())}
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold px-8"
          >
            {t('premium.back', 'Back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
  <div
    className="h-full w-full overflow-y-auto"
    style={{
      background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(20,10,20,0.92))',
      // Use clamp to respect the device safe-area inset while keeping
      // a reasonable minimum and maximum top padding for notched devices.
      paddingTop: 'clamp(16px, env(safe-area-inset-top, 0px), 28px)',
      marginTop: '4px',
      // Keep the responsive horizontal padding via remaining classes on inner container
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      minHeight: '100%',
      position: 'relative'
    }}
  >
      <div
        className="max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8"
        style={{
          paddingBottom: Capacitor.getPlatform() === 'web' ? 0 : 'env(safe-area-inset-bottom, 0px)'
        }}
      >
          {/* Header Section */}
          <div className="text-center mb-4 md:mb-6">
            <div className="relative flex items-center justify-center mb-2 md:mb-4">
              <button
                type="button"
                onClick={() => (onClose ? onClose() : window.history.back())}
                aria-label={t('premium.back', 'Back')}
                className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center text-white active:opacity-60 transition-opacity"
                style={{ background: 'none', border: 'none', padding: 0 }}
              >
                <ChevronLeft className="w-8 h-8" strokeWidth={3} />
              </button>
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
              <Card className="border-2 border-yellow-400/70 relative overflow-hidden shadow-xl bg-gradient-to-br from-neutral-900 to-black transition-all duration-300 w-full">
                {/* Popular Badge */}
                <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-black px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-bold rounded-bl-lg shadow-lg responsive-text">
                  {t('premium.mostPopular')}
                </div>

              <CardHeader className="text-center pb-3 md:pb-5 pt-4 md:pt-7 px-2 md:px-4">
                {pageTrialEligible && (
                  <div className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/40 px-2.5 py-1 text-[10px] md:text-xs font-semibold uppercase tracking-wide text-pink-300">
                    <Sparkles className="w-3 h-3" />
                    {pageTrialOfferInfo.trialPeriodLabel || 'Free trial'} free
                  </div>
                )}
                <CardTitle className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold flex items-center justify-center text-white responsive-text">
                  <Crown className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 text-yellow-400 mr-2 sm:mr-3" />
                  {t('premium.premiumPlan')}
                </CardTitle>
                <div className="mt-2 md:mt-3">
                  <div className="space-y-2 md:space-y-3">
                    {/* Monthly payment option - shows localized IAP price, or the real
                        free-trial offer straight from Apple/Google when one is active */}
                    <div className="p-1.5 md:p-2 bg-gradient-to-r from-pink-500/10 to-sky-500/10 border border-pink-500/40 rounded-lg">
                      {pageTrialEligible ? (
                        <>
                          <div className="text-sm sm:text-base md:text-xl font-bold text-yellow-400">
                            Free for {pageTrialOfferInfo.trialPeriodLabel || 'a limited time'}
                          </div>
                          <div className="text-[10px] md:text-xs text-white/70 mt-0.5">
                            then {pageTrialOfferInfo.priceAfterTrial || (pricingConfig.loading ? '...' : displayPrice)}/month
                          </div>
                        </>
                      ) : (
                        <div className="text-sm sm:text-base md:text-xl font-bold text-white">
                          {pricingConfig.loading ? '...' : displayPrice}
                        </div>
                      )}
                      <div className="text-[9px] md:text-xs text-sky-300 font-medium mt-0.5">📱 {t('premium.monthlySubscription')}</div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-1.5 md:space-y-4 px-2 md:px-5 pb-4 md:pb-7">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2 md:space-x-3 p-1 md:p-2.5 bg-white/5 rounded-lg">
                    <div className="bg-yellow-400/20 p-1 md:p-1.5 rounded-full flex-shrink-0">
                      <feature.icon className="w-3.5 h-3.5 md:w-5 md:h-5 text-yellow-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-[11px] md:text-base responsive-text truncate">{feature.name}</div>
                      <div className="text-[10px] md:text-sm text-green-400 font-medium responsive-text">{feature.premium}</div>
                    </div>
                    <Check className="w-3.5 h-3.5 md:w-5 md:h-5 text-green-400 flex-shrink-0" />
                  </div>
                ))}

                {/* Extra Premium Features */}
                <div className="flex items-center space-x-2 md:space-x-3 p-1 md:p-2.5 bg-gradient-to-r from-yellow-400/10 to-orange-400/10 rounded-lg border border-yellow-400/30">
                  <div className="bg-yellow-400/20 p-1 md:p-1.5 rounded-full flex-shrink-0">
                    <Crown className="w-3.5 h-3.5 md:w-5 md:h-5 text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-[11px] md:text-base responsive-text truncate">{t('premium.features.allFutureFeatures.name')}</div>
                    <div className="text-[10px] md:text-sm text-green-400 font-medium responsive-text">{t('premium.features.allFutureFeatures.premium')}</div>
                  </div>
                  <Check className="w-3.5 h-3.5 md:w-5 md:h-5 text-green-400 flex-shrink-0" />
                </div>

                {/* CTA Button */}
                <div className="pt-2 md:pt-4 text-center">
                  <Button
                    onClick={handleUpgrade}
                    className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-400 hover:from-yellow-500 hover:via-yellow-600 hover:to-orange-500 text-black font-bold py-2 md:py-3 px-3 md:px-6 rounded-full text-sm md:text-base shadow-lg transition-all duration-200"
                  >
                    <Crown className="w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2" />
                    {pageTrialEligible ? 'Start Free Trial' : t('premium.upgradeButton')}
                  </Button>
                  
                  {/* Restore Purchases Link for iOS and Android */}
                  {showRestoreButton && (
                    <button
                      onClick={handleRestorePurchases}
                      disabled={restoreLoading}
                      className="mt-3 text-xs md:text-sm text-gray-300 hover:text-white underline disabled:opacity-50 transition-colors"
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
            <Card className="border-2 border-white/15 shadow-md bg-neutral-900 relative transition-all duration-300 w-full">
              <CardHeader className="text-center pb-3 md:pb-5 px-2 md:px-4">
                <CardTitle className="text-lg sm:text-xl md:text-2xl font-bold text-gray-200 responsive-text">{t('premium.freePlan')}</CardTitle>
                <div className="mt-2 md:mt-3">
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-200">{currencySymbol} 0</div>
                  <div className="text-[10px] md:text-xs text-gray-400 mt-1">{t('premium.basicFeaturesOnly')}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 md:space-y-3 px-2 md:px-5 pb-4 md:pb-7">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2 md:space-x-3 p-1 md:p-2.5 bg-white/5 rounded-lg">
                    <div className="bg-white/10 p-1 md:p-1.5 rounded-full flex-shrink-0">
                      <feature.icon className="w-3.5 h-3.5 md:w-5 md:h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-200 text-[11px] md:text-base responsive-text truncate">{feature.name}</div>
                      <div className="text-[10px] md:text-sm text-gray-400 responsive-text">{feature.free}</div>
                    </div>
                    <X className="w-3.5 h-3.5 md:w-5 md:h-5 text-gray-500 flex-shrink-0" />
                  </div>
                ))}
                <div className="pt-3 md:pt-5 text-center">
                  <p className="text-gray-400 text-xs md:text-sm mt-2 responsive-text">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-2 sm:px-4">
          <div className="bg-neutral-900 border border-pink-500/30 rounded-lg shadow-lg p-3 sm:p-5 w-full max-w-md relative">
            <button
              onClick={() => {
                setShowPaymentOptions(false);
                // Reset loading states when modal is closed
                setIapLoading(false);
                setGoogleIapLoading(false);
              }}
              className="absolute top-2 right-2 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-base sm:text-lg font-bold mb-3 text-center text-white">
              {t('premium.paymentOptions.title')}
            </h2>
            <div className="space-y-3">
              {/* Apple IAP - show on iOS native when available */}
              {isIosNative && canBuy && (
                <>
                  <button
                    onClick={() => handlePaymentTypeSelection('iap')}
                    disabled={iapLoading}
                    className="w-full p-3.5 bg-gradient-to-r from-gray-800 to-black text-white rounded-lg border-2 border-white/20 hover:border-white/40 shadow-lg hover:shadow-xl active:scale-[0.98] transition-all duration-200 font-semibold disabled:opacity-50 disabled:active:scale-100"
                  >
                    <div className="flex items-center justify-center gap-2 text-sm sm:text-base">
                      {iapLoading ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
                          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                        </svg>
                      )}
                      <span>
                        {iapLoading
                          ? t('premium.paymentOptions.iap.processing')
                          : pageTrialEligible
                            ? 'Start Free Trial'
                            : t('premium.paymentOptions.iap.button')}
                      </span>
                    </div>
                    <div className="text-xs opacity-90 mt-0.5">
                      {pageTrialEligible
                        ? `Free for ${pageTrialOfferInfo.trialPeriodLabel || 'a limited time'}, then ${pageTrialOfferInfo.priceAfterTrial || (pricingConfig.loading ? '...' : displayPrice)}/month`
                        : t('premium.paymentOptions.iap.subtitle')}
                    </div>
                  </button>

                  {/* Auto-renewal disclosure */}
                  <div className="text-[10px] text-gray-400 text-center px-2 -mt-2">
                    {t('premium.paymentOptions.iap.disclosure')}
                  </div>
                </>
              )}
              
              {/* Loading message when IAP is not ready on iOS */}
              {isIosNative && !canBuy && !iapLoadingTimeout && (
                <div className="text-center p-3 bg-sky-500/10 rounded-lg border border-sky-500/30">
                  <div className="text-sky-300 mb-1 text-sm font-semibold">{t('premium.paymentOptions.loading.title')}</div>
                  <div className="text-xs text-sky-400">{t('premium.paymentOptions.loading.message')}</div>
                </div>
              )}
              {isIosNative && !canBuy && iapLoadingTimeout && (
                <div className="text-center p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                  <div className="text-amber-300 mb-1 text-sm font-semibold">{t('premium.paymentOptions.unavailable.title')}</div>
                  <div className="text-xs text-amber-400">
                    {t('premium.paymentOptions.unavailable.message')}
                  </div>
                </div>
              )}
              
              {/* Paystack/Card Payment Options - web only for now (temporarily
                  disabled on the Android app, see showPaystackOption above) */}
              {showPaystackOption && (
                <button
                  onClick={() => handlePaymentTypeSelection('subscription')}
                  className="w-full p-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg border-2 border-emerald-300/40 hover:border-emerald-300/70 shadow-lg shadow-emerald-900/30 hover:shadow-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all duration-200 font-semibold"
                >
                  <div className="text-sm sm:text-base">💳 Pay with Paystack</div>
                  <div className="text-xs opacity-90 mt-0.5">{paystackButtonSubtitle}</div>
                </button>
              )}

              {/* Google IAP - show on Android native */}
              {isAndroidNative && (
                <>
                  <button
                    onClick={() => handlePaymentTypeSelection('google_iap')}
                    disabled={googleIapLoading || !canBuyGoogle}
                    className="w-full p-3.5 bg-gradient-to-r from-gray-800 to-black text-white rounded-lg border-2 border-white/20 hover:border-white/40 shadow-lg hover:shadow-xl active:scale-[0.98] transition-all duration-200 font-semibold disabled:opacity-50 disabled:active:scale-100"
                  >
                    <div className="text-sm sm:text-base flex items-center justify-center gap-2">
                      {googleIapLoading ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          Processing...
                        </>
                      ) : pageTrialEligible ? (
                        <>
                          <svg className="h-4 w-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Start Free Trial
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Pay with Google
                        </>
                      )}
                    </div>
                    <div className="text-xs opacity-90 mt-0.5">
                      {pageTrialEligible
                        ? `Free for ${pageTrialOfferInfo.trialPeriodLabel || 'a limited time'}, then ${pageTrialOfferInfo.priceAfterTrial || googlePrice || `${currencySymbol}${monthlyPrice}`}/month`
                        : `${googlePrice || `${currencySymbol}${monthlyPrice}`}/month • Google Play`}
                    </div>
                  </button>
                  
                  {/* Auto-renewal disclosure */}
                  <div className="text-[10px] text-gray-400 text-center px-2 -mt-2">
                    Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period.
                  </div>

                  {/* Show status message if Google IAP not available */}
                  {!canBuyGoogle && googleIapLoadingTimeout && (
                    <div className="text-center text-xs text-gray-400 -mt-1">
                      Google Play billing isn't available right now. Please try again shortly.
                    </div>
                  )}
                </>
              )}

              {/* Safety net: every real device matches exactly one of the
                  blocks above. Reaching here with nothing shown means the
                  native platform check hasn't resolved yet (or something else
                  is genuinely off) - never leave this modal looking blank. */}
              {noPaymentMethodMatched && (
                <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-white text-sm font-semibold mb-1">Getting things ready...</div>
                  <div className="text-xs text-gray-400 mb-3">
                    If this doesn't update in a few seconds, close this and try again.
                  </div>
                  <button
                    onClick={() => {
                      setShowPaymentOptions(false);
                      setTimeout(() => setShowPaymentOptions(true), 50);
                    }}
                    className="text-xs text-pink-400 hover:text-pink-300 underline"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modals - Show on Web and Android (NOT on iOS native) */}
      <PaystackPaymentModal
        isOpen={showPaymentModal && (!deviceIsNative || !deviceIsIos)}
        onClose={() => setShowPaymentModal(false)}
        amount={Number.isFinite(paystackChargedGhsAmount) ? paystackChargedGhsAmount : parseFloat(ghsPrice)}
        currency="GHS"
        displayAmount={Number.isFinite(paystackDisplayAmount) ? paystackDisplayAmount : parseFloat(monthlyPrice)}
        displayCurrency={paystackDisplayCurrency}
        email={currentUser?.email || ''}
        onSuccess={handlePaymentSuccess}
        paymentMethod={paymentMethods[0]?.type ?? 'card'}
        isOneTime={paymentType === 'one-time'}
      />
    </div>
  );
};

export default React.memo(PremiumUpgrade);
