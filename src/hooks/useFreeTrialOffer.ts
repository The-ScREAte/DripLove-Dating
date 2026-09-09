import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useEnhancedSubscription } from '@/hooks/useEnhancedSubscription';
import { extractFreeTrialOfferInfo, selectPurchasableProduct, FreeTrialOfferInfo } from '@/utils/iapOfferInfo';
import { isIOS, isNativeApp } from '@/utils/iap';
import { isAndroid } from '@/iap-google';
import { buyMonthly } from '@/iap';
import { buyGoogleMonthly } from '@/iap-google';

// Same product IDs the real purchase flow (PremiumUpgrade.tsx / iap.ts /
// iap-google.ts) already uses - kept in this one place per platform so
// there's a single source of truth for "which IDs are ours."
const APPLE_PRODUCT_IDS = [
  'com.driplove.dating.premium.monthlysub3',
  'com.driplove.dating.premium.monthlysub2',
];
const GOOGLE_PRODUCT_IDS = ['premium_monthly', 'monthly', 'com.driplove.dating.premium.monthly'];

type CdvStoreProduct = {
  owned?: boolean;
  canPurchase?: boolean;
  offers?: Array<{ pricingPhases?: Array<{ price?: string; billingPeriod?: string; paymentMode?: string }> }>;
  getOffer?: () => unknown;
};
type CdvStoreWhen = {
  productUpdated: (cb: () => void) => CdvStoreWhen;
  verified: (cb: () => void) => CdvStoreWhen;
};
type CdvStore = {
  get?: (id: string) => CdvStoreProduct | undefined;
  when?: () => CdvStoreWhen;
};

const getCdvStore = (): CdvStore | undefined =>
  (window as unknown as { CdvPurchase?: { store?: CdvStore } }).CdvPurchase?.store;

const isCancellationError = (err: unknown): boolean => {
  const message =
    typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? ((err as { message: string }).message || '').toLowerCase()
      : '';
  const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: unknown }).code : undefined;
  return message.includes('cancel') || code === 'UserCancel' || code === 2;
};

interface UseFreeTrialOfferResult {
  /** True while we don't yet know enough to decide anything - render nothing */
  loading: boolean;
  /** Not premium, and the store currently offers a free-trial pricing phase
   *  on our product for this account/device - the same signal the real
   *  payment sheet is about to act on. */
  eligibleForTrial: boolean;
  /** Not premium, the store no longer offers a trial, and this account has a
   *  real Apple/Google subscription on record - i.e. a trial (or paid
   *  period) that already ended. */
  trialEnded: boolean;
  offerInfo: FreeTrialOfferInfo;
  /** True once the store has a purchasable product ready to order */
  canStart: boolean;
  starting: boolean;
  startTrial: () => Promise<void>;
}

export const useFreeTrialOffer = (userId: string | undefined): UseFreeTrialOfferResult => {
  const { isPremium, loading: subscriptionLoading, refetch: refetchSubscription } = useEnhancedSubscription();

  const [offerInfo, setOfferInfo] = useState<FreeTrialOfferInfo>({
    hasFreeTrial: false,
    trialDays: null,
    trialPeriodLabel: '',
    priceAfterTrial: null,
  });
  const [canStart, setCanStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [hadRealSubscriptionBefore, setHadRealSubscriptionBefore] = useState<boolean | null>(null);
  // Whether the native store has given us a definitive read yet (either a
  // product came back, or the retry window below ran out) - lets `loading`
  // hold off on the trial/no-trial decision for a moment instead of
  // flashing the no-trial copy while the store is still connecting.
  const [storeChecked, setStoreChecked] = useState(false);

  const refetchRef = useRef(refetchSubscription);
  useEffect(() => {
    refetchRef.current = refetchSubscription;
  }, [refetchSubscription]);

  const nativeAndroid = isNativeApp() && isAndroid();
  const nativeIos = isNativeApp() && isIOS();

  // Has this account ever had a real Apple/Google subscription row (active,
  // cancelled, expired - any of them)? If so, and they're free now, that's a
  // trial (or paid period) that ended, not a fresh trial offer.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setHadRealSubscriptionBefore(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .in('payment_method', ['apple', 'google'])
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setHadRealSubscriptionBefore(!error && !!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Live product/offer info straight from the store - no hardcoded trial length.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || (!nativeIos && !nativeAndroid)) {
      // No native store to ask (web/PWA) - nothing more to wait for.
      setStoreChecked(true);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const readOffer = () => {
      const store = getCdvStore();
      if (!store?.get) return;

      const product = nativeAndroid
        ? selectPurchasableProduct((id) => store.get(id), GOOGLE_PRODUCT_IDS)
        : selectPurchasableProduct((id) => store.get(id), APPLE_PRODUCT_IDS);

      // Nothing purchasable yet (still loading) - leave prior state alone
      // rather than clearing it, and let the 1s/3s retries above try again.
      if (!product || cancelled) return;
      setOfferInfo(extractFreeTrialOfferInfo(product));
      setCanStart(!!product.canPurchase);
      setStoreChecked(true);
    };

    readOffer();
    timers.push(setTimeout(readOffer, 1000));
    // Final attempt - whether or not a product ever came back, this is as
    // long as we wait before deciding one way or the other. Otherwise a
    // store that never responds (billing genuinely down) would leave the
    // trial/no-trial decision hanging forever instead of settling on
    // "no trial" like any other unavailable offer.
    timers.push(setTimeout(() => {
      readOffer();
      setStoreChecked(true);
    }, 3000));

    const store = getCdvStore();
    let whenHandle: CdvStoreWhen | undefined;
    if (store?.when) {
      try {
        whenHandle = store.when().productUpdated(readOffer).verified(() => {
          // Optimistic: reflect premium immediately rather than waiting on
          // the Apple/Google -> webhook -> DB round trip.
          refetchRef.current?.();
        });
      } catch {
        // best effort
      }
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      void whenHandle;
    };
  }, [nativeIos, nativeAndroid]);

  const startTrial = useCallback(async () => {
    if (starting || !canStart) return;
    setStarting(true);
    try {
      if (nativeAndroid) {
        await buyGoogleMonthly();
      } else {
        await buyMonthly();
      }
      // Purchase resolved (native sheet closed on success) - the `verified`
      // listener above already triggers a refetch, but do one more here too
      // so the banner's own consumer re-renders as fast as possible.
      refetchRef.current?.();
    } catch (err) {
      // Per spec: on failure/cancellation, dismiss silently and keep the
      // banner visible - no error toast from this component.
      if (!isCancellationError(err)) {
        console.warn('[FreeTrialOffer] Purchase failed:', err);
      }
    } finally {
      setStarting(false);
    }
  }, [starting, canStart, nativeAndroid]);

  const loading = subscriptionLoading || hadRealSubscriptionBefore === null || !storeChecked;
  // The store itself is the source of truth for "is a free trial actually
  // available right now" - Apple only attaches the intro offer when
  // isEligibleForIntroOffer is true, and Google simply omits the FreeTrial
  // pricing phase for accounts that already used it, so offerInfo.hasFreeTrial
  // already mirrors exactly what the real payment sheet is about to do.
  // Our own subscription history (hadRealSubscriptionBefore) is a DB record
  // of past charges, not a live eligibility check - it can disagree with the
  // store (e.g. a past sandbox/test purchase, or a lapsed subscription that
  // the store still offers a fresh trial against), and gating on it made the
  // in-app UI contradict what the user then saw at checkout. It still drives
  // the "resubscribe" copy for someone the store no longer offers a trial to.
  const eligibleForTrial = !loading && !isPremium && offerInfo.hasFreeTrial;
  const trialEnded = !loading && !isPremium && !offerInfo.hasFreeTrial && hadRealSubscriptionBefore === true;

  return { loading, eligibleForTrial, trialEnded, offerInfo, canStart, starting, startTrial };
};
