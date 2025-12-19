import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';

// TypeScript declaration for window.store
declare global {
  interface Window {
    googleIapInitialized?: boolean;
    googleIapInitializationFailed?: boolean;
    googleIapPurchaseInitiated?: boolean;
  }
}

// Google Play product IDs - MUST match exactly what's in Google Play Console
const GOOGLE_PRODUCT_IDS = [
  'premium_monthly',  // Main subscription product ID from Google Play Console
  'com.driplove.dating.premium.monthly', // Alternative format
];

export const isAndroid = () => {
  return Capacitor.getPlatform() === 'android';
};

export function initGoogleIAP() {
  return new Promise<void>((resolve, reject) => {
    // Only initialize on Android
    if (!isAndroid()) {
      resolve();
      return;
    }

    // If not a Cordova app, resolve immediately
    if (typeof window.cordova === 'undefined') {
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
        console.log('[Google IAP] Products registered:', GOOGLE_PRODUCT_IDS);
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
              console.log('[Google IAP] Product updated:', p.id, 'canPurchase:', p.canPurchase);
              clearTimeout(initializationTimeout);
              window.googleIapInitializationFailed = false;
              window.googleIapInitialized = true;
            }
          })
          .approved(async (t: any) => {
            console.log('[Google IAP] Transaction approved:', t?.productId);

            // On many Android configurations, `.verified()` is not reliably emitted
            // (e.g., when no validator is configured). If we only activate premium
            // in `.verified()`, the user never gets premium.
            //
            // To match the working Apple/Paystack behavior (DB updated -> UI sees premium),
            // activate premium here for user-initiated purchases.
            if (!window.googleIapPurchaseInitiated) {
              if (t?.finish && typeof t.finish === 'function') t.finish();
              return;
            }

            window.googleIapPurchaseInitiated = false;

            try {
              const { supabase } = await import('@/integrations/supabase/client');
              const { data: { user } } = await supabase.auth.getUser();

              if (user) {
                const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                const purchaseToken =
                  t?.purchaseToken ||
                  t?.transactionId ||
                  t?.id ||
                  t?.nativePurchase?.purchaseToken ||
                  t?.productId ||
                  null;

                await supabase
                  .from('user_subscriptions')
                  .upsert({
                    user_id: user.id,
                    plan_name: 'premium',
                    status: 'active',
                    flutterwave_transaction_id: purchaseToken,
                    starts_at: new Date().toISOString(),
                    expires_at: expiryDate.toISOString(),
                    next_billing_date: expiryDate.toISOString(),
                    auto_renew: true,
                    payment_method: 'google',
                    payment_attempts: 0,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'user_id' });

                console.log('[Google IAP] Premium activated for user:', user.id);
                window.location.href = '/payment-success?status=successful&payment_type=iap';
              }
            } catch (error) {
              console.error('[Google IAP] Error activating premium on approved:', error);
              alert('Payment processing failed. Please try again or contact support.');
            } finally {
              if (t?.finish && typeof t.finish === 'function') t.finish();
            }
          })
          .verified(async (r: any) => {
            // Keep handler for completeness; some environments may still emit verified.
            // We do not rely on it for entitlement activation.
            console.log('[Google IAP] Purchase verified:', r?.productId);

            if (r?.finish && typeof r.finish === 'function') {
              r.finish();
            }
          })
          .unverified((r: any, err: any) => {
            console.warn('[Google IAP] unverified:', r?.productId, err?.message);
            window.googleIapPurchaseInitiated = false;
          });
      }

      // Initialize for Google Play
      if (store.initialize && typeof store.initialize === 'function') {
        try {
          store.initialize([{ platform: Platform.GOOGLE_PLAY }]);

          if (store.ready && typeof store.ready === 'function') {
            store.ready(() => {
              console.log('[Google IAP] Store ready');
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
    // @ts-ignore
    if (window.cordova && window.cordova.platformId) {
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

  window.googleIapPurchaseInitiated = true;

  let product = null;
  let offer = null;

  // Try to find a valid product with an offer
  for (const id of GOOGLE_PRODUCT_IDS) {
    try {
      const p = store.get ? store.get(id) : null;
      console.log(`[Google IAP] Checking product ${id}:`, p ? {
        id: p.id,
        canPurchase: p.canPurchase,
        hasOffer: !!p.getOffer?.()
      } : 'not found');
      
      if (p) {
        const o = p.getOffer?.();
        if (o && typeof o.order === 'function') {
          product = p;
          offer = o;
          console.log('[Google IAP] Found valid product with offer:', id);
          break;
        } else if (p.canPurchase) {
          // Fallback: product is purchasable but getOffer might work differently
          product = p;
          console.log('[Google IAP] Found purchasable product:', id);
        }
      }
    } catch (err) {
      console.warn(`[Google IAP] Could not load product ${id}:`, err);
    }
  }

  if (!product) {
    console.error('[Google IAP] No valid product found. Available products:', 
      store.products?.map((p: any) => ({ id: p.id, canPurchase: p.canPurchase })) || 'none');
    window.googleIapPurchaseInitiated = false;
    throw new Error('No valid subscription product available. Please check your Google Play account.');
  }

  try {
    if (offer && typeof offer.order === 'function') {
      console.log('[Google IAP] Ordering via offer:', product.id);
      await offer.order();
    } else if (product.getOffer && typeof product.getOffer === 'function') {
      const productOffer = product.getOffer();
      if (productOffer && typeof productOffer.order === 'function') {
        console.log('[Google IAP] Ordering via product.getOffer():', product.id);
        await productOffer.order();
      } else {
        throw new Error('Product offer not available');
      }
    } else if (store.order && typeof store.order === 'function') {
      // Fallback to store.order
      console.log('[Google IAP] Ordering via store.order:', product.id);
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

// Restore purchases
export function restoreGooglePurchases(): Promise<void> {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    const store = window.CdvPurchase?.store;

    if (!store) {
      console.error('[Google IAP] Cannot restore purchases - store not available');
      reject(new Error('Store not available'));
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve();
    }, 5000);

    if (store.restorePurchases && typeof store.restorePurchases === 'function') {
      store.restorePurchases();
      setTimeout(() => {
        clearTimeout(timeoutId);
        resolve();
      }, 3000);
    } else if (store.refresh && typeof store.refresh === 'function') {
      store.refresh();
      setTimeout(() => {
        clearTimeout(timeoutId);
        resolve();
      }, 3000);
    } else {
      clearTimeout(timeoutId);
      reject(new Error('Restore method not available'));
    }
  });
}
