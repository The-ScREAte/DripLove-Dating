import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';

const noopLog = (..._args: unknown[]) => {};

// Detect platform
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const isIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

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
    localStorage.setItem('driplove_iap_completed', '1');
    localStorage.setItem('driplove_iap_completed_ts', String(Date.now()));
  } catch {
    // ignore
  }
}

// Check if payment was recently completed (within 5 minutes)
function wasPaymentRecentlyCompleted(): boolean {
  try {
    const completed = localStorage.getItem('driplove_iap_completed');
    const ts = localStorage.getItem('driplove_iap_completed_ts');
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

export function initIAP() {
  return new Promise<void>((resolve, reject) => {
    
    // If not a Cordova app, resolve immediately
    if (typeof (window as any).cordova === 'undefined') {
      resolve();
      return;
    }

    // Function to initialize the store
    const initializeStore = () => {
      
      // @ts-ignore
      const { store, LogLevel, Platform, ProductType, log } = window.CdvPurchase || {};
      if (!store) {
        console.error('[IAP] CdvPurchase.store not available! StoreKit not loaded.');
        window.iapInitializationFailed = true;
        resolve(); // Resolve to not block app
        return;
      }
      
      // Set log level to ERROR in production to hide technical messages from users
      if (log && LogLevel && typeof log.setLevel === 'function') {
        // Use ERROR level in production, DEBUG only in development
        const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        log.setLevel(isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR);
        noopLog('[IAP] Log level set to:', isDevelopment ? 'DEBUG' : 'ERROR');
        noopLog('[IAP] Environment:', isDevelopment ? 'DEVELOPMENT (StoreKit Testing)' : 'PRODUCTION');
      }

      // Disable automatic error popups from the plugin
      if (store.autoFinishTransactions !== undefined) {
        store.autoFinishTransactions = false;
      }
      
      // Add timeout protection for initialization (15 seconds)
      let initializationTimeout = setTimeout(() => {
        console.error('[IAP] Store initialization timeout after 15 seconds');
        window.iapInitializationFailed = true;
        resolve(); // Resolve to not block app
      }, 15000);
    
    // 1️⃣ Define possible product IDs - try newest first
    const PRODUCT_IDS = [
      'com.driplove.dating.premium.monthlysub3',  // new one linked to this build
      'com.driplove.dating.premium.monthlysub2'   // older one (fallback)
    ];

    // Determine platform for registration
    const currentPlatform = isAndroid() ? Platform.GOOGLE_PLAY : Platform.APPLE_APPSTORE;
    noopLog('[IAP] Registering products for platform:', isAndroid() ? 'GOOGLE_PLAY' : 'APPLE_APPSTORE');
    noopLog('[IAP] Product IDs to register:', PRODUCT_IDS);

    // 2️⃣ Register all of them with the store for the correct platform
    if (store.register && typeof store.register === 'function') {
      const productsToRegister = PRODUCT_IDS.map(id => ({
        id,
        platform: currentPlatform,
        type: ProductType.PAID_SUBSCRIPTION
      }));
      noopLog('[IAP] Registering products:', JSON.stringify(productsToRegister, null, 2));
      store.register(productsToRegister);
      noopLog('[IAP] Products registered, waiting for productUpdated events...');
    } else {
      console.error('[IAP] store.register not available');
      clearTimeout(initializationTimeout);
      window.iapInitializationFailed = true;
      return;
    }

    // 2) Global error handler (covers user cancel + other errors)
    if (store.error && typeof store.error === 'function') {
      store.error(e => {
        // Only log to console, don't show user-facing errors here
        // User-facing errors will be handled in the UI layer
        console.warn('[IAP] Store error:', {
          code: e?.code,
          message: e?.message,
          isSetupError: e?.code === 'SETUP',
          isCommunicationError: e?.code === 'COMMUNICATION'
        });
        
        // Reset loading state on error
        window.iapPurchaseInitiated = false;
        
        // Set flag to indicate connection failed (for UI to handle)
        if (e?.code === 'SETUP' || e?.code === 'COMMUNICATION') {
          console.error('[IAP] Connection to App Store failed. Make sure:', 
            '\n  1. You are running from Xcode (not standalone)',
            '\n  2. StoreKit Configuration is enabled in scheme',
            '\n  3. You are signed out of production App Store'
          );
          window.iapInitializationFailed = true;
        }
      });
    }
    
    // 3) Core lifecycle - using the correct API structure
    if (store.when && typeof store.when === 'function') {
      noopLog('[IAP] Setting up store.when() event handlers...');
      store.when()
        .productUpdated(p => {
          // Product updated successfully - clear initialization timeout
          noopLog('[IAP] productUpdated event received for:', p?.id);
          
          // Check if it's one of our registered products
          const isOurProduct = PRODUCT_IDS.includes(p?.id);
          if (p && isOurProduct) {
            noopLog('[IAP] ✅ Product loaded successfully:', p.id, 'Price:', p.pricing?.price);
            noopLog('[IAP] Product details:', {
              id: p.id,
              title: p.title,
              canPurchase: p.canPurchase,
              owned: p.owned,
              state: p.state
            });
            clearTimeout(initializationTimeout);
            window.iapInitializationFailed = false;
          } else if (p) {
            noopLog('[IAP] Ignoring product (not in our list):', p.id);
          }
        })
        .approved(t => {
          // Only verify if user explicitly initiated the purchase
          if (window.iapPurchaseInitiated) {
            if (t.verify && typeof t.verify === 'function') {
              t.verify();
            }
          } else {
            if (t.finish && typeof t.finish === 'function') {
              t.finish();
            }
          }
        })
        .verified(async (r) => {
          
          // GUARD: Prevent redirect if already on payment-success page or recently completed
          if (isOnPaymentSuccessPage() || wasPaymentRecentlyCompleted()) {
            noopLog('[IAP] Already on success page or recently completed, just finishing transaction');
            if (r?.finish && typeof r.finish === 'function') r.finish();
            return;
          }
          
          // Reset the purchase flag
          window.iapPurchaseInitiated = false;
          
          // Validate receipt with server-side function for security
          try {
            const { supabase } = await import('@/integrations/supabase/client');
            
            // Get user - but also try to use stored user_id as fallback
            const { data: { user } } = await supabase.auth.getUser();
            
            // Determine payment method based on platform
            const paymentMethod = isAndroid() ? 'google' : 'apple';
            
            // Try to get stored user_id from localStorage (set before purchase)
            let userId = user?.id;
            if (!userId) {
              try {
                const storedUserId = localStorage.getItem('driplove_iap_user_id');
                if (storedUserId) {
                  userId = storedUserId;
                  noopLog('[IAP] Using stored user_id:', userId);
                }
              } catch (e) {
                // localStorage not available
              }
            }
            
            if (!userId) {
              console.error('[IAP] No user identification available');
              alert('Please log in to complete your purchase.');
              return;
            }
            
            noopLog('[IAP] Processing verified receipt for user:', userId);
            noopLog('[IAP] Receipt object:', {
              productId: r.productId,
              transactionId: r.transactionId,
              hasReceipt: !!r.receipt,
              hasPayload: !!r.payload,
              platform: paymentMethod
            });
            
            // Get receipt data from the transaction
            const receiptData = r.receipt || r.payload || r.transactionReceipt;
            const transactionId = r.transactionId || r.productId || `iap_${Date.now()}`;

            if (!receiptData) {
              // No receipt data means we cannot verify this purchase with Apple/Google.
              // Never grant premium without server-side verification -- the client is
              // untrusted and must not be able to write its own entitlement.
              console.warn('[IAP] No receipt data available; cannot verify purchase');
              alert('Could not verify your purchase. Please use "Restore Purchases" or contact support.');
              return;
            }

            noopLog('[IAP] Receipt data found, attempting server validation...');

            // Add timeout protection for receipt validation (25 seconds)
            const validationTimeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Receipt validation timeout')), 25000);
            });

            // Choose the correct validator based on platform
            const validatorFunction = isAndroid() ? 'google-iap-validator' : 'iap-receipt-validator';
            noopLog('[IAP] Using validator function:', validatorFunction);

            // CRITICAL: Always include user_id in body for session-independent activation
            const validationPromise = supabase.functions.invoke(validatorFunction, {
              body: {
                receiptData: receiptData,
                productId: r.productId,
                user_id: userId, // Fallback for session-expired scenarios
                purchaseToken: r.purchaseToken || r.transactionId,
                transactionId: transactionId
              }
            });

            let validation, validationError;
            try {
              const result: any = await Promise.race([validationPromise, validationTimeout]);
              validation = result.data;
              validationError = result.error;
              noopLog('[IAP] Validation response:', { validation, validationError });
            } catch (timeoutError) {
              console.error('[IAP] Receipt validation timeout');
              validationError = timeoutError;
            }

            // The validator edge function is the ONLY thing that writes to
            // user_subscriptions for this flow -- it runs with the service-role key
            // after verifying the receipt with Apple/Google. The client never
            // activates premium itself; a database trigger also rejects any
            // client-originated write that grants or extends entitlement.
            if (validationError || !validation?.valid || !validation?.active) {
              console.warn('[IAP] Server validation failed or subscription inactive:', validationError?.message || validation);
              alert('We could not verify your purchase yet. If you were charged, please try "Restore Purchases" in a moment, or contact support.');
              return;
            }

            // If we have a live session for this exact user, double-check the
            // entitlement was actually applied before redirecting (defends against
            // a race where the session switched accounts mid-purchase). This read
            // is RLS-gated to auth.uid() = user_id, so it only works when there IS
            // a live session -- when we fell back to the stored user_id above
            // (session expired mid-purchase), auth.uid() is null and this query
            // would always return nothing, so we skip it and trust the validator's
            // response directly: it already verified the receipt with Apple/Google
            // and wrote the row itself using the service-role key.
            if (user?.id && user.id === userId) {
              const { data: subRow } = await supabase
                .from('user_subscriptions')
                .select('plan_name, status, expires_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              const isPremiumNow = !!subRow && subRow.plan_name === 'premium' &&
                (subRow.status === 'active' || subRow.status === 'cancelled') &&
                (!subRow.expires_at || new Date(subRow.expires_at) > new Date());

              if (!isPremiumNow) {
                console.warn('[IAP] Validation ok but subscription not yet applied; skipping redirect');
                alert('Your purchase was verified. It may take a moment to appear -- please reopen the app shortly.');
                return;
              }
            }

            try { localStorage.removeItem('driplove_iap_user_id'); } catch (e) {}
            markPaymentCompleted();
            window.location.href = '/payment-success?status=successful&payment_type=iap';
          } catch (error: any) {
            console.error('[IAP] Error processing verified receipt:', error);
            // Handle error - ensure user doesn't get premium access on failure
            try {
              const { supabase } = await import('@/integrations/supabase/client');
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                // Get current payment attempts
                const { data: currentSub } = await supabase
                  .from('user_subscriptions')
                  .select('payment_attempts')
                  .eq('user_id', user.id)
                  .single();

                const attempts = (currentSub?.payment_attempts || 0) + 1;

                if (attempts >= 3) {
                  // Max attempts reached, deactivate subscription
                  await supabase.rpc('handle_payment_failure', {
                    p_user_id: user.id,
                    p_reason: `IAP verification failed after ${attempts} attempts: ` + error.message
                  });
                } else {
                  // Increment attempt counter
                  await supabase
                    .from('user_subscriptions')
                    .update({ 
                      payment_attempts: attempts,
                      updated_at: new Date().toISOString()
                    })
                    .eq('user_id', user.id);
                }
              }
            } catch (fallbackError) {
              console.error('[IAP] Fallback error handling failed:', fallbackError);
            }
            alert('Payment processing failed. Please try again or contact support.');
          }
          
          if (r.finish && typeof r.finish === 'function') {
            r.finish();
          }
        })
        .unverified((r, err) => {
          console.warn('[IAP] unverified:', r?.productId, err?.message);
          window.iapPurchaseInitiated = false;
        });
    }

    // 4) Initialize AFTER register, then refresh - use correct platform
    if (store.initialize && typeof store.initialize === 'function') {
      try {
        // Initialize for the correct platform
        const initPlatform = isAndroid() ? Platform.GOOGLE_PLAY : Platform.APPLE_APPSTORE;
        const initOptions = isAndroid() 
          ? { platform: initPlatform }
          : { platform: initPlatform, options: { needAppReceipt: true } };
        
        noopLog('[IAP] Calling store.initialize with platform:', initPlatform);
        store.initialize([initOptions]);
        noopLog('[IAP] store.initialize called successfully');
        
        // Add a ready state handler to clear timeout and resolve promise
        if (store.ready && typeof store.ready === 'function') {
          noopLog('[IAP] Setting up store.ready() handler...');
          store.ready(() => {
            noopLog('[IAP] ✅ Store is READY! Products should be loaded now.');
            noopLog('[IAP] Available products:', store.products?.map(p => ({ id: p.id, title: p.title, price: p.pricing?.price })));
            clearTimeout(initializationTimeout);
            window.iapInitializationFailed = false;
            resolve(); // Resolve when store is ready
          });
        } else {
          console.warn('[IAP] store.ready() not available, using timeout fallback');
          // If no ready handler, resolve after a short delay
          setTimeout(() => {
            clearTimeout(initializationTimeout);
            resolve();
          }, 2000);
        }
      } catch (error) {
        console.error('[IAP] Store initialization error:', error);
        clearTimeout(initializationTimeout);
        window.iapInitializationFailed = true;
        resolve(); // Resolve to not block app
        return;
      }
    } else {
      console.error('[IAP] store.initialize not available');
      clearTimeout(initializationTimeout);
      window.iapInitializationFailed = true;
      resolve(); // Resolve to not block app
      return;
    }
    
    if (store.refresh && typeof store.refresh === 'function') {
      try {
        store.refresh();
      } catch (error) {
        console.error('[IAP] Store refresh error:', error);
      }
    } else {
      console.error('[IAP] store.refresh not available');
    }
    };

    // Check if deviceready already fired
    if ((window as any).cordova && (window as any).cordova.platformId) {
      initializeStore();
    } else {
      // Set a timeout for deviceready event (10 seconds)
      const deviceReadyTimeout = setTimeout(() => {
        console.error('[IAP] deviceready event timeout after 10 seconds');
        window.iapInitializationFailed = true;
        resolve(); // Resolve anyway to not block app initialization
      }, 10000);

      document.addEventListener('deviceready', () => {
        clearTimeout(deviceReadyTimeout);
        initializeStore();
      }, { once: true });
    }
  });
}

// 🛍 Call to purchase from your UI - auto-selects the valid product
export const buyMonthly = async () => {
  // List all possible IDs (same as in initIAP) - try newest first
  const PRODUCT_IDS = [
    'com.driplove.dating.premium.monthlysub3',
    'com.driplove.dating.premium.monthlysub2'
  ];
  
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  if (!store) {
    console.error('[IAP] Store not available');
    throw new Error('Store not initialized');
  }
  
  // Store current user_id BEFORE purchase for session-independent activation
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      localStorage.setItem('driplove_iap_user_id', user.id);
      noopLog('[IAP] Stored user_id for purchase:', user.id);
    }
  } catch (e) {
    console.warn('[IAP] Could not store user_id:', e);
  }
  
  window.iapPurchaseInitiated = true;

  // Try to find the first valid product that can be purchased
  let product;
  for (const id of PRODUCT_IDS) {
    try {
      const p = store.get ? store.get(id) : null;
      noopLog(`[IAP] Checking product ${id}:`, { 
        exists: !!p, 
        canPurchase: p?.canPurchase, 
        owned: p?.owned,
        title: p?.title,
        price: p?.pricing?.price
      });
      if (p && p.canPurchase) {
        product = p;
        noopLog(`[IAP] ✅ Selected product: ${id}`);
        break;
      }
    } catch (err) {
      console.warn(`[IAP] Could not load product ${id}:`, err);
    }
  }

  if (!product) {
    console.error('[IAP] No valid product found among:', PRODUCT_IDS);
    noopLog('[IAP] Available products:', store.products?.map(p => ({ id: p.id, canPurchase: p.canPurchase, title: p.title })));
    window.iapPurchaseInitiated = false;
    throw new Error('No valid subscription product available');
  }

  // Continue with existing order logic
  try {
    const offer = product.getOffer?.();
    if (offer && typeof offer.order === 'function') {
      noopLog('[IAP] Ordering product:', product.id);
      await offer.order();
    } else {
      console.error('[IAP] No valid offer found for product:', product.id);
      window.iapPurchaseInitiated = false;
      throw new Error('No valid offer available');
    }
  } catch (error) {
    console.error('[IAP] Order failed:', error);
    window.iapPurchaseInitiated = false;
    throw error;
  }
};

// Call to restore purchases - returns a Promise with restoration result
export function restorePurchases(): Promise<{ restored: boolean; message: string }> {
  return new Promise(async (resolve, reject) => {
    // @ts-ignore
    const store = window.CdvPurchase?.store;
    
    if (!store) {
      console.error('[IAP] Cannot restore purchases - store not available');
      resolve({ restored: false, message: 'Store not available. Please ensure you are using the app on iOS.' });
      return;
    }
    
    noopLog('[IAP] Starting restore purchases...');
    
    // Mark that we're restoring (similar to purchase initiation)
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
    
    const rejectOnce = (error: any) => {
      if (!hasResolved) {
        hasResolved = true;
        window.iapPurchaseInitiated = false;
        reject(error);
      }
    };
    
    // Set up temporary listener for owned products during restore
    const PRODUCT_IDS = [
      'com.driplove.dating.premium.monthlysub3',
      'com.driplove.dating.premium.monthlysub2'
    ];
    
    // Validates a restored purchase against the server (which owns the write to
    // user_subscriptions). The client never writes entitlement directly -- trusting
    // a local "owned" flag without a server-verified receipt would let anyone
    // restore-purchase their way into premium without ever paying.
    const validateAndSyncSubscription = async (productId: string, transactionId?: string, receiptData?: string) => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          console.error('[IAP] No user found during restore');
          return false;
        }

        if (!receiptData) {
          console.warn('[IAP] No receipt data during restore; cannot verify without a server-validated receipt');
          return false;
        }

        noopLog('[IAP] Validating restored receipt with server...');
        const { data: validation, error: valError } = await supabase.functions.invoke('iap-receipt-validator', {
          body: {
            receiptData: receiptData,
            productId: productId,
            user_id: user.id,
            transactionId: transactionId
          }
        });

        if (valError || !validation?.valid || !validation?.active) {
          console.warn('[IAP] Server validation failed during restore:', valError || validation);
          return false;
        }

        // Entitlement is server-owned; the validator already updated user_subscriptions.
        noopLog('[IAP] ✅ Subscription validated/restored successfully');
        try { localStorage.removeItem('driplove_iap_user_id'); } catch (e) {}
        return true;
      } catch (error) {
        console.error('[IAP] Error validating restored subscription:', error);
        return false;
      }
    };
    
    const onProductUpdated = async (product: any) => {
      if (hasResolved) return;
      
      // Check if this is one of our products and it's owned
      if (product && PRODUCT_IDS.includes(product.id) && product.owned) {
        noopLog('[IAP] Found owned product during restore:', product.id);
        
        const transaction = product.transaction || product.latestTransaction;
        const receiptData = transaction?.appStoreReceipt || transaction?.receipt || transaction?.transactionReceipt;
        const transactionId = transaction?.transactionId || transaction?.id;
        
        const success = await validateAndSyncSubscription(product.id, transactionId, receiptData);
        
        if (success) {
          hasRestoredPurchase = true;
          resolveOnce({ restored: true, message: 'Subscription restored successfully' });
        }
      }
    };
    
    // Also check existing products immediately
    const checkExistingProducts = async () => {
      let foundOwned = false;
      for (const id of PRODUCT_IDS) {
        try {
          const product = store.get?.(id);
          if (product && product.owned) {
            foundOwned = true;
            noopLog('[IAP] Found already-owned product:', id);
            
            const transaction = product.transaction || product.latestTransaction;
            const receiptData = transaction?.appStoreReceipt || transaction?.receipt || transaction?.transactionReceipt;
            const transactionId = transaction?.transactionId || transaction?.id;
            
            const success = await validateAndSyncSubscription(id, transactionId, receiptData);
            
            if (success) {
              hasRestoredPurchase = true;
              resolveOnce({ restored: true, message: 'Subscription restored successfully' });
              return true;
            }
          }
        } catch (err) {
          console.warn('[IAP] Error checking product:', id, err);
        }
      }
      
      if (!foundOwned) {
        noopLog('[IAP] No owned products found in initial check');
      }
      return false;
    };
    
    // Set up listener
    if (store.when && typeof store.when === 'function') {
      try {
        store.when().productUpdated(onProductUpdated);
      } catch (err) {
        console.warn('[IAP] Could not set up product listener:', err);
      }
    }
    
    // Check existing products first
    const foundExisting = await checkExistingProducts();
    if (foundExisting) return;
    
    // Trigger the restore/refresh
    if (store.restorePurchases && typeof store.restorePurchases === 'function') {
      noopLog('[IAP] Calling store.restorePurchases()...');
      store.restorePurchases();
    } else if (store.refresh && typeof store.refresh === 'function') {
      noopLog('[IAP] Calling store.refresh()...');
      store.refresh();
    } else {
      console.error('[IAP] No restore or refresh method available');
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

// Debug helper function
export function debugIAPState() {
  // @ts-ignore
  const { store } = window.CdvPurchase || {};
  if (!store) {
    console.error('[IAP Debug] CdvPurchase.store not available');
    return;
  }

  let product, offer;
  try {
    product = store.get ? store.get('com.driplove.dating.premium.monthlysub1') : null;
    offer = product?.getOffer?.();
  } catch (error) {
    console.error('[IAP Debug] Error getting product:', error);
  }
  
  // Debug function - logs removed for production
  // Can be re-enabled for debugging if needed
}
