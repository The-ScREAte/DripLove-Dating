import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';
import { selectPurchasableProduct } from '@/utils/iapOfferInfo';

const noopLog = (..._args: unknown[]) => {};

// TypeScript declaration for window.store
declare global {
  interface Window {
    googleIapInitialized?: boolean;
    googleIapInitializationFailed?: boolean;
    /**
     * Tracks whether an IAP flow was explicitly initiated by the user.
     * - 'purchase' => user tapped "Upgrade" and started checkout
     * - 'restore'  => user tapped "Restore purchases"
     */
    googleIapFlow?: 'purchase' | 'restore';

    /** Legacy boolean kept for backwards-compat with existing code paths */
    googleIapPurchaseInitiated?: boolean;

    googleIapRedirecting?: boolean; // Prevent duplicate redirects
    googleIapValidationInProgress?: boolean; // Prevent duplicate validations
  }
}

// Google Play product IDs - MUST match exactly what's in Google Play Console
const GOOGLE_PRODUCT_IDS = [
  'premium_monthly',  // Main subscription product ID from Google Play Console
  'monthly',          // Base plan ID (Google Play Billing v5+)
  'com.driplove.dating.premium.monthly', // Alternative format
];

export const isAndroid = () => {
  return Capacitor.getPlatform() === 'android';
};

function tryParseJson(input: unknown): any | null {
  if (typeof input !== 'string') return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function extractPurchaseTokenFromAny(obj: any): string | null {
  if (!obj) return null;

  const direct =
    obj.purchaseToken ||
    obj?.nativePurchase?.purchaseToken ||
    obj?.receipt?.purchaseToken ||
    obj?.payload?.purchaseToken;

  if (typeof direct === 'string' && direct.length > 0) return direct;

  if (typeof obj.receipt === 'string') {
    const parsed = tryParseJson(obj.receipt);
    if (parsed?.purchaseToken && typeof parsed.purchaseToken === 'string') return parsed.purchaseToken;
  }

  if (typeof obj.payload === 'string') {
    const parsed = tryParseJson(obj.payload);
    if (parsed?.purchaseToken && typeof parsed.purchaseToken === 'string') return parsed.purchaseToken;
  }

  return null;
}

function getStoredIapUserId(): string | null {
  try {
    const storedUserId = localStorage.getItem('driplove_iap_user_id');
    return storedUserId && storedUserId.length > 0 ? storedUserId : null;
  } catch {
    return null;
  }
}

function markGoogleIapPending() {
  try {
    localStorage.setItem('driplove_google_iap_pending', '1');
    localStorage.setItem('driplove_google_iap_pending_ts', String(Date.now()));
  } catch {
    // ignore
  }
}

function clearGoogleIapPending() {
  try {
    localStorage.removeItem('driplove_google_iap_pending');
    localStorage.removeItem('driplove_google_iap_pending_ts');
  } catch {
    // ignore
  }
}

/**
 * Clear all IAP-related localStorage flags. 
 * MUST be called on user logout to prevent IAP state leaking to next logged-in user.
 */
export function clearAllIapState() {
  try {
    // Google IAP flags
    localStorage.removeItem('driplove_iap_user_id');
    localStorage.removeItem('driplove_google_iap_pending');
    localStorage.removeItem('driplove_google_iap_pending_ts');
    localStorage.removeItem('driplove_google_iap_completed');
    localStorage.removeItem('driplove_google_iap_completed_ts');

    // iOS IAP flags (from iap.ts)
    localStorage.removeItem('driplove_iap_completed');
    localStorage.removeItem('driplove_iap_completed_ts');

    // Clear window flags
    if (typeof window !== 'undefined') {
      window.googleIapFlow = undefined;
      window.googleIapPurchaseInitiated = false;
      window.googleIapRedirecting = false;
      window.googleIapValidationInProgress = false;
      window.iapPurchaseInitiated = false;
    }
  } catch (error) {
    console.error('[IAP] Error clearing IAP state:', error);
  }
}

// Check if we're already on the payment success page (prevents redirect loops)
function isOnPaymentSuccessPage(): boolean {
  try {
    return window.location.pathname === '/payment-success';
  } catch {
    return false;
  }
}

// Mark that we've completed a payment successfully (prevents re-redirect on page reload)
function markPaymentCompleted() {
  try {
    localStorage.setItem('driplove_google_iap_completed', '1');
    localStorage.setItem('driplove_google_iap_completed_ts', String(Date.now()));
  } catch {
    // ignore
  }
}

// Check if payment was recently completed (within 5 minutes)
function wasPaymentRecentlyCompleted(): boolean {
  try {
    const completed = localStorage.getItem('driplove_google_iap_completed');
    const ts = localStorage.getItem('driplove_google_iap_completed_ts');
    if (completed === '1' && ts) {
      const elapsed = Date.now() - Number(ts);
      // Consider completed if within 5 minutes
      return elapsed < 5 * 60 * 1000;
    }
  } catch {
    // ignore
  }
  return false;
}

// Clear payment completed flag (call when starting a new purchase)
function clearPaymentCompleted() {
  try {
    localStorage.removeItem('driplove_google_iap_completed');
    localStorage.removeItem('driplove_google_iap_completed_ts');
  } catch {
    // ignore
  }
}

export function initGoogleIAP() {
  return new Promise<void>((resolve, reject) => {
    // Only initialize on Android
    if (!isAndroid()) {
      resolve();
      return;
    }

    // If not a Cordova app, resolve immediately
    if (typeof (window as any).cordova === 'undefined') {
      resolve();
      return;
    }

    const initializeStore = () => {
      // @ts-ignore
      const { store, LogLevel, Platform, ProductType, log } = window.CdvPurchase || {};
      
      if (!store) {
        console.error('[Google IAP] CdvPurchase.store not available!');
        window.googleIapInitializationFailed = true;
        resolve();
        return;
      }

      // Set log level
      if (log && LogLevel && typeof log.setLevel === 'function') {
        const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        log.setLevel(isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR);
      }

      // Add timeout protection for initialization (15 seconds)
      let initializationTimeout = setTimeout(() => {
        console.error('[Google IAP] Store initialization timeout after 15 seconds');
        window.googleIapInitializationFailed = true;
        resolve();
      }, 15000);

      // Register products with Google Play
      if (store.register && typeof store.register === 'function') {
        store.register(GOOGLE_PRODUCT_IDS.map(id => ({
          id,
          platform: Platform.GOOGLE_PLAY,
          type: ProductType.PAID_SUBSCRIPTION
        })));
        noopLog('[Google IAP] Products registered:', GOOGLE_PRODUCT_IDS);
      } else {
        console.error('[Google IAP] store.register not available');
        clearTimeout(initializationTimeout);
        window.googleIapInitializationFailed = true;
        resolve();
        return;
      }

      // Global error handler
      if (store.error && typeof store.error === 'function') {
        store.error((e: any) => {
          console.warn('[Google IAP] Store error:', e?.code, e?.message);
          window.googleIapPurchaseInitiated = false;
          
          if (e?.code === 'SETUP' || e?.code === 'COMMUNICATION') {
            window.googleIapInitializationFailed = true;
          }
        });
      }

      // Core lifecycle
      if (store.when && typeof store.when === 'function') {
        store.when()
          .productUpdated((p: any) => {
            const isOurProduct = GOOGLE_PRODUCT_IDS.includes(p?.id);
            if (p && isOurProduct) {
              noopLog('[Google IAP] Product updated:', p.id, 'canPurchase:', p.canPurchase);
              clearTimeout(initializationTimeout);
              window.googleIapInitializationFailed = false;
              window.googleIapInitialized = true;
            }
          })
          .approved((t: any) => {
            noopLog('[Google IAP] Transaction approved:', t?.productId);

            // ✅ CRITICAL: Never auto-activate premium on Android from "owned" transactions.
            // Only proceed if the user explicitly started a purchase flow, OR we are returning
            // from the Google Play UI (pending flag set).
            const hasPending = (() => {
              try {
                const pending = localStorage.getItem('driplove_google_iap_pending') === '1';
                const tsRaw = localStorage.getItem('driplove_google_iap_pending_ts');
                const ts = tsRaw ? Number(tsRaw) : 0;
                const isRecent = pending && Number.isFinite(ts) && ts > 0 && Date.now() - ts < 15 * 60 * 1000;
                // Auto-clear stale pending state
                if (pending && !isRecent) clearGoogleIapPending();
                return isRecent;
              } catch {
                return false;
              }
            })();

            const userInitiatedPurchase = window.googleIapFlow === 'purchase' || window.googleIapPurchaseInitiated === true;

            if (!userInitiatedPurchase && !hasPending) {
              noopLog('[Google IAP] Ignoring approved event (not user-initiated)');
              if (t?.finish && typeof t.finish === 'function') t.finish();
              return;
            }

            // GUARD: Prevent redirect if already on payment-success page or recently completed
            if (isOnPaymentSuccessPage() || wasPaymentRecentlyCompleted()) {
              noopLog('[Google IAP] Already on success page or recently completed, just finishing transaction');
              if (t?.finish && typeof t.finish === 'function') t.finish();
              return;
            }

            // GUARD: Prevent duplicate validations/redirects
            if (window.googleIapRedirecting || window.googleIapValidationInProgress) {
              noopLog('[Google IAP] Already processing, skipping duplicate approved event');
              if (t?.finish && typeof t.finish === 'function') t.finish();
              return;
            }
            window.googleIapValidationInProgress = true;

            // Don't rely on `t.verify()` / `.verified()` — they may not fire if the plugin
            // validator isn't configured, or if the WebView reloads while returning from
            // the Google Play UI. Instead, validate directly with our Supabase Edge Function.
            (async () => {
              try {
                const { supabase } = await import('@/integrations/supabase/client');

                // Only allow activation for the CURRENT authenticated user.
                // (This prevents a device-level Google subscription from upgrading arbitrary app accounts.)
                const { data: { user } } = await supabase.auth.getUser();
                const userId = user?.id || null;

                if (!userId) {
                  // No alert here — just stop. User must log in and explicitly tap upgrade/restore.
                  console.warn('[Google IAP] Approved event while not authenticated; skipping');
                  window.googleIapValidationInProgress = false;
                  return;
                }

                // Try to extract identifiers from the approved transaction.
                const productId = t?.productId || t?.id || t?.products?.[0]?.id;
                const receiptData = t?.receipt || t?.payload || t?.transactionReceipt || t;
                const purchaseToken =
                  extractPurchaseTokenFromAny(t) ||
                  extractPurchaseTokenFromAny(receiptData) ||
                  (typeof t?.transactionId === 'string' ? t.transactionId : null);
                const transactionId =
                  (typeof t?.transactionId === 'string' ? t.transactionId : null) ||
                  purchaseToken ||
                  `google_${Date.now()}`;

                if (!productId || !purchaseToken) {
                  console.error('[Google IAP] Missing productId/purchaseToken (approved)', {
                    hasProductId: !!productId,
                    hasPurchaseToken: !!purchaseToken,
                  });
                  window.googleIapValidationInProgress = false;
                  return;
                }

                noopLog('[Google IAP] Calling server validator (approved):', { productId });
                const { data: validation, error: validationError } = await supabase.functions.invoke('google-iap-validator', {
                  body: {
                    receiptData,
                    productId,
                    purchaseToken,
                    transactionId,
                    user_id: userId,
                  },
                });

                if (validationError || !validation?.valid || !validation?.active) {
                  console.error('[Google IAP] Server validation failed (approved):', validationError || validation);
                  window.googleIapValidationInProgress = false;
                  return;
                }

                // Double-check entitlement was applied to THIS user before redirecting.
                const { data: subRow } = await supabase
                  .from('user_subscriptions')
                  .select('plan_name, status, expires_at')
                  .eq('user_id', userId)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                const isPremiumNow = !!subRow && subRow.plan_name === 'premium' && (subRow.status === 'active' || subRow.status === 'cancelled') && (!subRow.expires_at || new Date(subRow.expires_at) > new Date());
                if (!isPremiumNow) {
                  console.warn('[Google IAP] Validation ok but subscription not applied to current user; skipping redirect');
                  window.googleIapValidationInProgress = false;
                  return;
                }

                clearGoogleIapPending();
                try { localStorage.removeItem('driplove_iap_user_id'); } catch {}

                // Success: redirect to success page (only once)
                if (!window.googleIapRedirecting) {
                  window.googleIapRedirecting = true;
                  markPaymentCompleted();
                  window.location.href = '/payment-success?status=successful&payment_type=iap';
                }
              } catch (err) {
                console.error('[Google IAP] Error during approved validation:', err);
                window.googleIapValidationInProgress = false;
              } finally {
                window.googleIapPurchaseInitiated = false;
                window.googleIapFlow = undefined;
                if (t?.finish && typeof t.finish === 'function') t.finish();
              }
            })();
          })
          .verified(async (r: any) => {
            noopLog('[Google IAP] Purchase verified:', r?.productId);

            const hasPending = (() => {
              try {
                const pending = localStorage.getItem('driplove_google_iap_pending') === '1';
                const tsRaw = localStorage.getItem('driplove_google_iap_pending_ts');
                const ts = tsRaw ? Number(tsRaw) : 0;
                const isRecent = pending && Number.isFinite(ts) && ts > 0 && Date.now() - ts < 15 * 60 * 1000;
                if (pending && !isRecent) clearGoogleIapPending();
                return isRecent;
              } catch {
                return false;
              }
            })();

            const userInitiatedPurchase = window.googleIapFlow === 'purchase' || window.googleIapPurchaseInitiated === true;
            if (!userInitiatedPurchase && !hasPending) {
              noopLog('[Google IAP] Ignoring verified event (not user-initiated)');
              if (r?.finish && typeof r.finish === 'function') r.finish();
              return;
            }

            // GUARD: Prevent redirect if already on payment-success page or recently completed
            if (isOnPaymentSuccessPage() || wasPaymentRecentlyCompleted()) {
              noopLog('[Google IAP] Already on success page or recently completed, just finishing transaction');
              if (r?.finish && typeof r.finish === 'function') r.finish();
              return;
            }

            // GUARD: Prevent duplicate validations/redirects
            if (window.googleIapRedirecting || window.googleIapValidationInProgress) {
              noopLog('[Google IAP] Already processing, skipping duplicate verified event');
              if (r?.finish && typeof r.finish === 'function') r.finish();
              return;
            }
            window.googleIapValidationInProgress = true;

            try {
              const { supabase } = await import('@/integrations/supabase/client');

              // Only allow activation for the CURRENT authenticated user.
              const { data: { user } } = await supabase.auth.getUser();
              const userId = user?.id || null;

              if (!userId) {
                console.warn('[Google IAP] Verified event while not authenticated; skipping');
                window.googleIapValidationInProgress = false;
                return;
              }

              const receiptData = r?.receipt || r?.payload || r?.transactionReceipt;
              const productId = r?.productId || r?.id;
              const purchaseToken = extractPurchaseTokenFromAny(r) || (typeof r?.transactionId === 'string' ? r.transactionId : null);
              const transactionId = (typeof r?.transactionId === 'string' ? r.transactionId : null) || purchaseToken || `google_${Date.now()}`;

              if (!productId || !purchaseToken) {
                console.error('[Google IAP] Missing productId/purchaseToken for server validation');
                window.googleIapValidationInProgress = false;
                return;
              }

              const { data: validation, error: validationError } = await supabase.functions.invoke('google-iap-validator', {
                body: {
                  receiptData,
                  productId,
                  purchaseToken,
                  transactionId,
                  user_id: userId,
                },
              });

              if (validationError || !validation?.valid || !validation?.active) {
                console.error('[Google IAP] Server validation failed:', validationError || validation);
                window.googleIapValidationInProgress = false;
                return;
              }

              // Double-check entitlement was applied to THIS user before redirecting.
              const { data: subRow } = await supabase
                .from('user_subscriptions')
                .select('plan_name, status, expires_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              const isPremiumNow = !!subRow && subRow.plan_name === 'premium' && (subRow.status === 'active' || subRow.status === 'cancelled') && (!subRow.expires_at || new Date(subRow.expires_at) > new Date());
              if (!isPremiumNow) {
                console.warn('[Google IAP] Validation ok but subscription not applied to current user; skipping redirect');
                window.googleIapValidationInProgress = false;
                return;
              }

              clearGoogleIapPending();
              try { localStorage.removeItem('driplove_iap_user_id'); } catch {}

              if (!window.googleIapRedirecting) {
                window.googleIapRedirecting = true;
                markPaymentCompleted();
                window.location.href = '/payment-success?status=successful&payment_type=iap';
              }
            } catch (error) {
              console.error('[Google IAP] Error during server validation:', error);
              window.googleIapValidationInProgress = false;
            } finally {
              window.googleIapFlow = undefined;
              if (r?.finish && typeof r.finish === 'function') r.finish();
            }
          })
          .unverified((r: any, err: any) => {
            console.warn('[Google IAP] unverified:', r?.productId, err?.message);
            window.googleIapPurchaseInitiated = false;
            window.googleIapFlow = undefined;
          });
      }

      // Initialize for Google Play
      if (store.initialize && typeof store.initialize === 'function') {
        try {
          store.initialize([{ platform: Platform.GOOGLE_PLAY }]);

          if (store.ready && typeof store.ready === 'function') {
            store.ready(() => {
              noopLog('[Google IAP] Store ready');
              clearTimeout(initializationTimeout);
              window.googleIapInitializationFailed = false;
              window.googleIapInitialized = true;
              resolve();
            });
          } else {
            setTimeout(() => {
              clearTimeout(initializationTimeout);
              resolve();
            }, 2000);
          }
        } catch (error) {
          console.error('[Google IAP] Store initialization error:', error);
          clearTimeout(initializationTimeout);
          window.googleIapInitializationFailed = true;
          resolve();
          return;
        }
      } else {
        console.error('[Google IAP] store.initialize not available');
        clearTimeout(initializationTimeout);
        window.googleIapInitializationFailed = true;
        resolve();
        return;
      }

      if (store.refresh && typeof store.refresh === 'function') {
        try {
          store.refresh();
        } catch (error) {
          console.error('[Google IAP] Store refresh error:', error);
        }
      }
    };

    // Check if deviceready already fired
    if ((window as any).cordova && (window as any).cordova.platformId) {
      initializeStore();
    } else {
      const deviceReadyTimeout = setTimeout(() => {
        console.error('[Google IAP] deviceready event timeout after 10 seconds');
        window.googleIapInitializationFailed = true;
        resolve();
      }, 10000);

      document.addEventListener('deviceready', () => {
        clearTimeout(deviceReadyTimeout);
        initializeStore();
      }, { once: true });
    }
  });
}

// Get Google Play products with localized prices
export async function getGoogleProducts(): Promise<{ id: string; price: string; currency: string; title: string; description: string } | null> {
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  
  if (!store || !isAndroid()) {
    return null;
  }

  try {
    for (const id of GOOGLE_PRODUCT_IDS) {
      const product = store.get ? store.get(id) : null;
      if (product && product.pricing) {
        return {
          id: product.id,
          price: product.pricing.price || product.price,
          currency: product.pricing.currency || 'USD',
          title: product.title || 'Premium Monthly',
          description: product.description || 'Unlimited access to all premium features'
        };
      }
    }
  } catch (error) {
    console.error('[Google IAP] Error getting products:', error);
  }

  return null;
}

// Check if Google IAP can be used
export function canUseGoogleIAP(): boolean {
  if (!isAndroid()) return false;
  
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  if (!store) return false;

  for (const id of GOOGLE_PRODUCT_IDS) {
    try {
      const product = store.get ? store.get(id) : null;
      if (product && product.canPurchase) {
        return true;
      }
    } catch (err) {
      console.warn(`[Google IAP] Could not check product ${id}:`, err);
    }
  }

  return false;
}

// Purchase subscription
export const buyGoogleMonthly = async () => {
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  
  if (!store) {
    console.error('[Google IAP] Store not available');
    throw new Error('Store not initialized');
  }

  // Reset validation/redirect guards for new purchase
  window.googleIapValidationInProgress = false;
  window.googleIapRedirecting = false;
  clearPaymentCompleted(); // Clear any previous completion flag

  // Store current user_id BEFORE purchase for session-independent activation
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      localStorage.setItem('driplove_iap_user_id', user.id);
      noopLog('[Google IAP] Stored user_id for purchase:', user.id);
    }
  } catch (e) {
    console.warn('[Google IAP] Could not store user_id:', e);
  }

  // Persist a pending flag so returning from Google Play UI can still verify.
  markGoogleIapPending();

  window.googleIapPurchaseInitiated = true;

  let offer = null;

  // Same selection algorithm the trial/price display (useFreeTrialOffer,
  // usePricingConfig) uses - only ever a purchasable product, preferring
  // whichever one actually carries a free-trial offer. Sharing this exact
  // selector keeps what's shown and what's charged structurally in sync.
  for (const id of GOOGLE_PRODUCT_IDS) {
    const p = store.get ? store.get(id) : null;
    noopLog(`[Google IAP] Checking product ${id}:`, p ? {
      id: p.id,
      canPurchase: p.canPurchase,
      hasOffer: !!p.getOffer?.()
    } : 'not found');
  }
  const product = selectPurchasableProduct((id) => (store.get ? store.get(id) : null), GOOGLE_PRODUCT_IDS);

  if (product) {
    // p.getOffer() is a shortcut to offers[0] - explicitly prefer whichever
    // offer actually carries a FreeTrial phase so the configured trial can
    // never get silently skipped by picking the wrong offer (e.g. a base
    // plan with no trial) at purchase time.
    const offers: Array<{ pricingPhases?: Array<{ paymentMode?: string }>; order?: () => Promise<void> }> =
      Array.isArray(product.offers) ? product.offers : [];
    const trialOffer = offers.find((candidate) =>
      (candidate.pricingPhases || []).some((phase) => phase.paymentMode === 'FreeTrial')
    );
    offer = trialOffer ?? product.getOffer?.();
    noopLog('[Google IAP] Selected product:', product.id, trialOffer ? '(trial offer)' : '(default offer)');
  }

  if (!product) {
    console.error('[Google IAP] No valid product found. Available products:', 
      store.products?.map((p: any) => ({ id: p.id, canPurchase: p.canPurchase })) || 'none');
    window.googleIapPurchaseInitiated = false;
    throw new Error('No valid subscription product available. Please check your Google Play account.');
  }

  try {
    if (offer && typeof offer.order === 'function') {
      noopLog('[Google IAP] Ordering via offer:', product.id);
      await offer.order();
    } else if (product.getOffer && typeof product.getOffer === 'function') {
      const productOffer = product.getOffer();
      if (productOffer && typeof productOffer.order === 'function') {
        noopLog('[Google IAP] Ordering via product.getOffer():', product.id);
        await productOffer.order();
      } else {
        throw new Error('Product offer not available');
      }
    } else if (store.order && typeof store.order === 'function') {
      // Fallback to store.order
      noopLog('[Google IAP] Ordering via store.order:', product.id);
      await store.order(product);
    } else {
      console.error('[Google IAP] No valid purchase method found');
      throw new Error('Unable to initiate purchase');
    }
  } catch (error: any) {
    console.error('[Google IAP] Order failed:', error?.message || error);
    window.googleIapPurchaseInitiated = false;
    throw error;
  }
};

// Find the real Transaction for an owned product among the store's locally
// held receipts. Product has no `.transaction`/`.latestTransaction` field --
// the transaction (and its purchaseToken, via its parent Receipt) lives on
// the Receipt that contains it.
function findGoogleTransactionForProduct(store: any, productId: string): any {
  try {
    const receipts = store?.localReceipts || [];
    for (const receipt of receipts) {
      const tx = (receipt.transactions || []).find((t: any) =>
        (t.products || []).some((p: any) => p.id === productId)
      );
      if (tx) return tx;
    }
  } catch (e) {
    console.warn('[Google IAP] Error finding transaction for product:', productId, e);
  }
  return undefined;
}

// Restore purchases
//
// IMPORTANT: this used to call store.restorePurchases() fire-and-forget and
// race an 8-second timeout against a `productUpdated` listener waiting for
// `product.owned`, while reading the purchase token off fields
// (`product.transaction`/`.latestTransaction`) that don't exist on Product at
// all. store.restorePurchases() already returns a Promise that resolves once
// Google Play's queryPurchases() round trip actually completes -- awaiting it
// directly, then reading the real Transaction off the store's receipts, is
// both correct and far more reliable than the old polling approach.
export function restoreGooglePurchases(): Promise<{ restored: boolean; message: string }> {
  return new Promise(async (resolve) => {
    // @ts-ignore
    const store = window.CdvPurchase?.store;

    if (!store) {
      console.error('[Google IAP] Cannot restore purchases - store not available');
      resolve({ restored: false, message: 'Store not available. Please ensure you are using the app on Android.' });
      return;
    }

    window.googleIapPurchaseInitiated = true;

    const finish = (result: { restored: boolean; message: string }) => {
      window.googleIapPurchaseInitiated = false;
      resolve(result);
    };

    // Safety net only -- store.restorePurchases() below is awaited for its
    // real result; this just prevents the UI from hanging forever if the
    // native side never calls back at all.
    const safetyTimeout = new Promise<{ restored: boolean; message: string }>((res) => {
      setTimeout(() => res({ restored: false, message: 'Restore is taking longer than expected. Please check your connection and try again.' }), 30000);
    });

    const doRestore = async (): Promise<{ restored: boolean; message: string }> => {
      try {
        if (store.restorePurchases && typeof store.restorePurchases === 'function') {
          noopLog('[Google IAP] Calling store.restorePurchases() and awaiting completion...');
          await store.restorePurchases();
        } else if (store.refresh && typeof store.refresh === 'function') {
          noopLog('[Google IAP] restorePurchases() unavailable, falling back to store.refresh()...');
          await store.refresh();
        } else {
          return { restored: false, message: 'Restore not available on this device' };
        }

        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || getStoredIapUserId();
        if (!userId) {
          return { restored: false, message: 'Please log in and try again.' };
        }

        let alreadyLinkedMessage: string | null = null;
        for (const id of GOOGLE_PRODUCT_IDS) {
          const product = store.get?.(id);
          if (!product || !product.owned) continue;

          const transaction = findGoogleTransactionForProduct(store, id);
          const purchaseToken =
            transaction?.parentReceipt?.purchaseToken ||
            transaction?.nativePurchase?.purchaseToken ||
            extractPurchaseTokenFromAny(transaction);

          if (!purchaseToken) {
            console.warn('[Google IAP] Owned product found but no purchaseToken available:', id);
            continue;
          }

          noopLog('[Google IAP] Validating restored purchase for product:', id);
          const { data: validation, error: valError } = await supabase.functions.invoke('google-iap-validator', {
            body: {
              receiptData: purchaseToken,
              productId: id,
              user_id: userId,
              purchaseToken,
              transactionId: transaction?.transactionId,
            },
          });

          if (!valError && validation?.valid && validation?.active) {
            clearGoogleIapPending();
            try { localStorage.removeItem('driplove_iap_user_id'); } catch {}
            return { restored: true, message: 'Subscription restored successfully' };
          }
          console.warn('[Google IAP] Server validation failed during restore:', valError || validation);
          // GAP FIX: surface the real reason ("this subscription is tied to a
          // different account") instead of collapsing it into the same
          // generic "nothing to restore" message - retrying restore can
          // never fix that case, so the user needs to know it's different.
          const message: string | undefined = typeof validation?.error === 'string' ? validation.error : undefined;
          if (message && message.toLowerCase().includes('already linked')) {
            alreadyLinkedMessage = message;
          }
        }

        return { restored: false, message: alreadyLinkedMessage || 'No active subscription found. If you previously purchased, it may have expired.' };
      } catch (error) {
        console.error('[Google IAP] Error during restore:', error);
        return { restored: false, message: 'Restore failed. Please try again.' };
      }
    };

    const result = await Promise.race([doRestore(), safetyTimeout]);
    finish(result);
  });
}
