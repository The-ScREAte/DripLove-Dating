import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useEnhancedSubscription } from '@/hooks/useEnhancedSubscription';
import { extractFreeTrialOfferInfo, FreeTrialOfferInfo } from '@/utils/iapOfferInfo';
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
const GOOGLE_PRODUCT_ID = 'premium_monthly';

type CdvStoreProduct = {
  owned?: boolean;
  canPurchase?: boolean;
  offers?: unknown[];
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
  /** Not premium, never had a real (Apple/Google) subscription before, and the
   *  store currently offers a free-trial pricing phase on our product. */
  eligibleForTrial: boolean;
  /** Not premium, but previously had a real Apple/Google subscription that's
   *  since lapsed - i.e. their trial (or paid period) ended. */
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
    if (!Capacitor.isNativePlatform() || (!nativeIos && !nativeAndroid)) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const readOffer = () => {
      const store = getCdvStore();
      if (!store?.get) return;

      const product = nativeAndroid
        ? store.get(GOOGLE_PRODUCT_ID)
        : APPLE_PRODUCT_IDS.map((id) => store.get(id)).find(Boolean);

      if (!product || cancelled) return;
      setOfferInfo(extractFreeTrialOfferInfo(product));
      setCanStart(!!product.canPurchase || !!product.getOffer?.());
    };

    readOffer();
    timers.push(setTimeout(readOffer, 1000));
    timers.push(setTimeout(readOffer, 3000));

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

  const loading = subscriptionLoading || hadRealSubscriptionBefore === null;
  const eligibleForTrial = !loading && !isPremium && hadRealSubscriptionBefore === false && offerInfo.hasFreeTrial;
  const trialEnded = !loading && !isPremium && hadRealSubscriptionBefore === true;

  return { loading, eligibleForTrial, trialEnded, offerInfo, canStart, starting, startTrial };
};
