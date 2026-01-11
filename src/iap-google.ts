import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';

const noopLog = (..._args: unknown[]) => {};

// TypeScript declaration for window.store
declare global {
  interface Window {
    googleIapInitialized?: boolean;
    googleIapInitializationFailed?: boolean;
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

                // Prefer current session user, but fall back to stored user_id.
                const { data: { user } } = await supabase.auth.getUser();
                const userId = user?.id || getStoredIapUserId();

                if (!userId) {
                  console.error('[Google IAP] No user identification available (approved)');
                  window.googleIapValidationInProgress = false;
                  alert('Please log in to complete your purchase.');
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
                  alert('Subscription could not be verified. Please try again.');
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
                  alert('Subscription could not be verified. Please try again.');
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
                alert('Subscription could not be verified. Please try again.');
              } finally {
                window.googleIapPurchaseInitiated = false;
                if (t?.finish && typeof t.finish === 'function') t.finish();
              }
            })();
          })
          .verified(async (r: any) => {
            noopLog('[Google IAP] Purchase verified:', r?.productId);

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
                window.googleIapValidationInProgress = false;
                alert('Please log in to complete your purchase.');
                return;
              }

              const receiptData = r?.receipt || r?.payload || r?.transactionReceipt;
              const productId = r?.productId || r?.id;
              const purchaseToken = extractPurchaseTokenFromAny(r) || (typeof r?.transactionId === 'string' ? r.transactionId : null);
              const transactionId = (typeof r?.transactionId === 'string' ? r.transactionId : null) || purchaseToken || `google_${Date.now()}`;

              if (!productId || !purchaseToken) {
                console.error('[Google IAP] Missing productId/purchaseToken for server validation');
                window.googleIapValidationInProgress = false;
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
                window.googleIapValidationInProgress = false;
                alert('Subscription could not be verified. Please try again.');
                return;
              }

              // Clear stored state on success
              clearGoogleIapPending();
              try { localStorage.removeItem('driplove_iap_user_id'); } catch (e) {}

              // Success: redirect to success page (only once)
              if (!window.googleIapRedirecting) {
                window.googleIapRedirecting = true;
                markPaymentCompleted();
                window.location.href = '/payment-success?status=successful&payment_type=iap';
              }
            } catch (error) {
              console.error('[Google IAP] Error during server validation:', error);
              window.googleIapValidationInProgress = false;
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
    window.googleIapPurchaseInitiated = true;
    
    let hasRestoredPurchase = false;
    let restoreError: any = null;
    let hasResolved = false;
    
    const resolveOnce = (result: { restored: boolean; message: string }) => {
      if (!hasResolved) {
        hasResolved = true;
        window.googleIapPurchaseInitiated = false;
        resolve(result);
      }
    };

    const validateAndSyncSubscription = async (productId: string, transactionId?: string, purchaseToken?: string | null, receiptData?: any) => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || getStoredIapUserId();

        if (!userId) {
          console.error('[Google IAP] No user identification available during restore');
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
            user_id: userId, // ✅ allow session-independent restore
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

        clearGoogleIapPending();
        try { localStorage.removeItem('driplove_iap_user_id'); } catch {}
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
