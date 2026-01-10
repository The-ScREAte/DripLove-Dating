import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';

const noopLog = (..._args: unknown[]) => {};

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

            // Never grant entitlement client-side.
            // Trigger verification and let the server update user_subscriptions.
            if (!window.googleIapPurchaseInitiated) {
              if (t?.finish && typeof t.finish === 'function') t.finish();
              return;
            }

            window.googleIapPurchaseInitiated = false;

            if (t?.verify && typeof t.verify === 'function') {
              t.verify();
              return;
            }

            console.error('[Google IAP] verify() not available on transaction');
            alert('Subscription could not be verified. Please try again.');
            if (t?.finish && typeof t.finish === 'function') t.finish();
          })
          .verified(async (r: any) => {
            noopLog('[Google IAP] Purchase verified:', r?.productId);

            try {
              const { supabase } = await import('@/integrations/supabase/client');
              
              // Get user - but also try to use stored user_id as fallback
              const { data: { user } } = await supabase.auth.getUser();
              
              // Try to get stored user_id from localStorage (set before purchase)
              let userId = user?.id;
              if (!userId) {
                try {
                  const storedUserId = localStorage.getItem('driplove_iap_user_id');
                  if (storedUserId) {
                    userId = storedUserId;
                    noopLog('[Google IAP] Using stored user_id:', userId);
                  }
                } catch (e) {
                  // localStorage not available
                }
              }
              
              if (!userId) {
                console.error('[Google IAP] No user identification available');
                alert('Please log in to complete your purchase.');
                return;
              }

              const receiptData = r?.receipt || r?.payload || r?.transactionReceipt;
              const productId = r?.productId || r?.id;
              const purchaseToken = extractPurchaseTokenFromAny(r) || (typeof r?.transactionId === 'string' ? r.transactionId : null);
              const transactionId = (typeof r?.transactionId === 'string' ? r.transactionId : null) || purchaseToken || `google_${Date.now()}`;

              if (!productId || !purchaseToken) {
                console.error('[Google IAP] Missing productId/purchaseToken for server validation');
                alert('Subscription could not be verified. Please try again.');
                return;
              }

              // CRITICAL: Always include user_id in body for session-independent activation
              const { data: validation, error: validationError } = await supabase.functions.invoke('google-iap-validator', {
                body: {
                  receiptData,
                  productId,
                  purchaseToken,
                  transactionId,
                  user_id: userId, // Fallback for session-expired scenarios
                },
              });

              if (validationError || !validation?.valid) {
                console.error('[Google IAP] Server validation failed:', validationError || validation);
                alert('Subscription could not be verified. Please try again.');
                return;
              }

              // Clear stored user_id on success
              try { localStorage.removeItem('driplove_iap_user_id'); } catch (e) {}

              window.location.href = '/payment-success?status=successful&payment_type=iap';
            } catch (error) {
              console.error('[Google IAP] Error during server validation:', error);
              alert('Subscription could not be verified. Please try again.');
            } finally {
              if (r?.finish && typeof r.finish === 'function') r.finish();
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

  window.googleIapPurchaseInitiated = true;

  let product = null;
  let offer = null;

  // Try to find a valid product with an offer
  for (const id of GOOGLE_PRODUCT_IDS) {
    try {
      const p = store.get ? store.get(id) : null;
      noopLog(`[Google IAP] Checking product ${id}:`, p ? {
        id: p.id,
        canPurchase: p.canPurchase,
        hasOffer: !!p.getOffer?.()
      } : 'not found');
      
      if (p) {
        const o = p.getOffer?.();
        if (o && typeof o.order === 'function') {
          product = p;
          offer = o;
          noopLog('[Google IAP] Found valid product with offer:', id);
          break;
        } else if (p.canPurchase) {
          // Fallback: product is purchasable but getOffer might work differently
          product = p;
          noopLog('[Google IAP] Found purchasable product:', id);
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

// Restore purchases
export function restoreGooglePurchases(): Promise<{ restored: boolean; message: string }> {
  return new Promise(async (resolve, reject) => {
    // @ts-ignore
    const store = window.CdvPurchase?.store;

    if (!store) {
      console.error('[Google IAP] Cannot restore purchases - store not available');
      resolve({ restored: false, message: 'Store not available. Please ensure you are using the app on Android.' });
      return;
    }

    noopLog('[Google IAP] Starting restore purchases...');
    
    // Mark that we're restoring
    window.iapPurchaseInitiated = true;
    
    let hasRestoredPurchase = false;
    let restoreError: any = null;
    let hasResolved = false;
    
    const resolveOnce = (result: { restored: boolean; message: string }) => {
      if (!hasResolved) {
        hasResolved = true;
        window.iapPurchaseInitiated = false;
        resolve(result);
      }
    };

    const validateAndSyncSubscription = async (productId: string, transactionId?: string, purchaseToken?: string | null, receiptData?: any) => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          console.error('[Google IAP] No user found during restore');
          return false;
        }
        
        const token = purchaseToken || extractPurchaseTokenFromAny(receiptData);

        if (!token) {
          console.warn('[Google IAP] Missing purchaseToken during restore; cannot verify');
          return false;
        }

        noopLog('[Google IAP] Validating restored purchase with server...');
        const { data: validation, error: valError } = await supabase.functions.invoke('google-iap-validator', {
          body: {
            receiptData,
            productId,
            userId: user.id,
            purchaseToken: token,
            transactionId,
          },
        });

        if (valError || !validation?.valid) {
          console.warn('[Google IAP] Server validation failed during restore:', valError || validation);
          return false;
        }

        if (!validation.active) {
          noopLog('[Google IAP] Server validation: subscription is not active');
          return false;
        }

        // Entitlement is server-owned. The validator updates user_subscriptions.
        noopLog('[Google IAP] ✅ Subscription validated/restored successfully');
        return true;
      } catch (error) {
        console.error('[Google IAP] Error activating subscription:', error);
        return false;
      }
    };

    const onProductUpdated = async (product: any) => {
      if (hasResolved) return;
      
      if (product && product.owned) {
        noopLog('[Google IAP] Found owned product during restore:', product.id);
        
        const transaction = product.transaction || product.latestTransaction;
        const receiptData = transaction?.receipt || transaction;
        const purchaseToken = extractPurchaseTokenFromAny(transaction) || extractPurchaseTokenFromAny(product) || null;
        const transactionId = transaction?.transactionId || transaction?.id || purchaseToken || undefined;
        
        const success = await validateAndSyncSubscription(product.id, transactionId, purchaseToken, receiptData);
        
        if (success) {
          hasRestoredPurchase = true;
          resolveOnce({ restored: true, message: 'Subscription restored successfully' });
        }
      }
    };
    
    // Check existing products first
    const checkExistingProducts = async () => {
      let foundOwned = false;
      for (const id of GOOGLE_PRODUCT_IDS) {
        try {
          const product = store.get?.(id);
          if (product && product.owned) {
            foundOwned = true;
            noopLog('[Google IAP] Found already-owned product:', id);
            
            const transaction = product.transaction || product.latestTransaction;
            const receiptData = transaction?.receipt || transaction;
            const purchaseToken = extractPurchaseTokenFromAny(transaction) || extractPurchaseTokenFromAny(product) || null;
            const transactionId = transaction?.transactionId || transaction?.id || purchaseToken || undefined;
            
            const success = await validateAndSyncSubscription(id, transactionId, purchaseToken, receiptData);
            
            if (success) {
              hasRestoredPurchase = true;
              resolveOnce({ restored: true, message: 'Subscription restored successfully' });
              return true;
            }
          }
        } catch (err) {
          console.warn('[Google IAP] Error checking product:', id, err);
        }
      }
      
      if (!foundOwned) {
        noopLog('[Google IAP] No owned products found in initial check');
      }
      return false;
    };
    
    // Set up listener
    if (store.when && typeof store.when === 'function') {
      try {
        store.when().productUpdated(onProductUpdated);
      } catch (err) {
        console.warn('[Google IAP] Could not set up product listener:', err);
      }
    }

    // Check existing products first
    const foundExisting = await checkExistingProducts();
    if (foundExisting) return;

    if (store.restorePurchases && typeof store.restorePurchases === 'function') {
      noopLog('[Google IAP] Calling store.restorePurchases()...');
      store.restorePurchases();
    } else if (store.refresh && typeof store.refresh === 'function') {
      noopLog('[Google IAP] Calling store.refresh()...');
      store.refresh();
    } else {
      resolveOnce({ restored: false, message: 'Restore not available on this device' });
      return;
    }
    
    // Wait for processing to complete
    setTimeout(() => {
      if (!hasResolved) {
        if (restoreError) {
          resolveOnce({ restored: false, message: restoreError.message || 'Restore failed' });
        } else if (hasRestoredPurchase) {
          resolveOnce({ restored: true, message: 'Subscription restored successfully' });
        } else {
          // No subscription found
          resolveOnce({ restored: false, message: 'No active subscription found. If you previously purchased, it may have expired.' });
        }
      }
    }, 8000);
  });
}
