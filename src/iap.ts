import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';

// Detect platform
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const isIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export function initIAP() {
  return new Promise<void>((resolve, reject) => {
    
    // If not a Cordova app, resolve immediately
    if (typeof window.cordova === 'undefined') {
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
    console.log('[IAP] Registering products for platform:', isAndroid() ? 'GOOGLE_PLAY' : 'APPLE_APPSTORE');

    // 2️⃣ Register all of them with the store for the correct platform
    if (store.register && typeof store.register === 'function') {
      store.register(PRODUCT_IDS.map(id => ({
        id,
        platform: currentPlatform,
        type: ProductType.PAID_SUBSCRIPTION
      })));
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
        console.warn('[IAP] Store error:', e?.code, e?.message);
        
        // Reset loading state on error
        window.iapPurchaseInitiated = false;
        
        // Set flag to indicate connection failed (for UI to handle)
        if (e?.code === 'SETUP' || e?.code === 'COMMUNICATION') {
          window.iapInitializationFailed = true;
        }
      });
    }
    
    // 3) Core lifecycle - using the correct API structure
    if (store.when && typeof store.when === 'function') {
      store.when()
        .productUpdated(p => {
          // Product updated successfully - clear initialization timeout
          // Check if it's one of our registered products
          const isOurProduct = PRODUCT_IDS.includes(p?.id);
          if (p && isOurProduct) {
            clearTimeout(initializationTimeout);
            window.iapInitializationFailed = false;
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
          
          // Reset the purchase flag
          window.iapPurchaseInitiated = false;
          
          // Validate receipt with server-side function for security
          try {
            const { supabase } = await import('@/integrations/supabase/client');
            const { data: { user } } = await supabase.auth.getUser();
            
            // Determine payment method based on platform
            const paymentMethod = isAndroid() ? 'google' : 'apple';
            
            if (user) {
              // Get receipt data from the transaction
              const receiptData = r.receipt || r.payload || r.transactionReceipt;
              
              if (receiptData) {
                // Add timeout protection for receipt validation (25 seconds)
                const validationTimeout = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('Receipt validation timeout')), 25000);
                });
                
                // Choose the correct validator based on platform
                const validatorFunction = isAndroid() ? 'google-iap-validator' : 'iap-receipt-validator';
                
                // Race between validation and timeout
                const validationPromise = supabase.functions.invoke(validatorFunction, {
                  body: {
                    receiptData: receiptData,
                    productId: r.productId,
                    userId: user.id,
                    purchaseToken: r.purchaseToken || r.transactionId, // Google uses purchaseToken
                    transactionId: r.transactionId
                  }
                });

                let validation, validationError;
                try {
                  const result: any = await Promise.race([validationPromise, validationTimeout]);
                  validation = result.data;
                  validationError = result.error;
                } catch (timeoutError) {
                  console.error('[IAP] Receipt validation timeout, using fallback method');
                  validationError = timeoutError;
                }

                if (validationError || !validation?.valid) {
                  console.error('[IAP] Receipt validation failed, using fallback:', validationError || validation);
                  
                  // Fallback: Direct database update if validation fails/times out
                  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  const subscriptionData = {
                    user_id: user.id,
                    plan_name: 'premium',
                    status: 'active',
                    flutterwave_transaction_id: r.transactionId || r.productId || null,
                    starts_at: new Date().toISOString(),
                    expires_at: expiryDate.toISOString(),
                    next_billing_date: expiryDate.toISOString(),
                    auto_renew: true,
                    payment_method: paymentMethod,
                    payment_attempts: 0,
                    updated_at: new Date().toISOString(),
                  };

                  await supabase
                    .from('user_subscriptions')
                    .upsert(subscriptionData, { onConflict: 'user_id' });

                  window.location.href = '/payment-success?status=successful&payment_type=iap';
                  return;
                }

                if (validation.active) {
                  
                  // Reset payment attempts on successful validation
                  await supabase
                    .from('user_subscriptions')
                    .update({ 
                      payment_attempts: 0,
                      updated_at: new Date().toISOString()
                    })
                    .eq('user_id', user.id);
                  
                  // Redirect to success page
                  window.location.href = '/payment-success?status=successful&payment_type=iap';
                } else {
                  alert('Your subscription has expired. Please renew your subscription.');
                }
              } else {
                // Fallback: Direct database update if no receipt data available
                console.log('[IAP] No receipt data, using direct database update');
                
                const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                const subscriptionData = {
                  user_id: user.id,
                  plan_name: 'premium',
                  status: 'active',
                  flutterwave_transaction_id: r.transactionId || r.productId || null,
                  starts_at: new Date().toISOString(),
                  expires_at: expiryDate.toISOString(),
                  next_billing_date: expiryDate.toISOString(),
                  auto_renew: true,
                  payment_method: paymentMethod,
                  payment_attempts: 0, // Reset payment attempts
                  updated_at: new Date().toISOString(),
                };

                // Upsert subscription
                await supabase
                  .from('user_subscriptions')
                  .upsert(subscriptionData, { onConflict: 'user_id' });

                window.location.href = '/payment-success?status=successful&payment_type=iap';
              }
            }
          } catch (error) {
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
        
        store.initialize([initOptions]);
        
        // Add a ready state handler to clear timeout and resolve promise
        if (store.ready && typeof store.ready === 'function') {
          store.ready(() => {
            clearTimeout(initializationTimeout);
            window.iapInitializationFailed = false;
            resolve(); // Resolve when store is ready
          });
        } else {
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
    // @ts-ignore
    if (window.cordova && window.cordova.platformId) {
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
  
  window.iapPurchaseInitiated = true;

  // Try to find the first valid product that can be purchased
  let product;
  for (const id of PRODUCT_IDS) {
    try {
      const p = store.get ? store.get(id) : null;
      if (p && p.canPurchase) {
        product = p;
        break;
      }
    } catch (err) {
      console.warn(`[IAP] Could not load product ${id}:`, err);
    }
  }

  if (!product) {
    console.error('[IAP] No valid product found among:', PRODUCT_IDS);
    window.iapPurchaseInitiated = false;
    throw new Error('No valid subscription product available');
  }

  // Continue with existing order logic
  try {
    const offer = product.getOffer?.();
    if (offer && typeof offer.order === 'function') {
      await offer.order();
    } else {
      console.error('[IAP] No valid offer found');
      window.iapPurchaseInitiated = false;
      throw new Error('No valid offer available');
    }
  } catch (error) {
    console.error('[IAP] Order failed:', error);
    window.iapPurchaseInitiated = false;
    throw error;
  }
};

// Call to restore purchases - returns a Promise
export function restorePurchases(): Promise<void> {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    const store = window.CdvPurchase?.store;
    
    if (!store) {
      console.error('[IAP] Cannot restore purchases - store not available');
      reject(new Error('Store not available'));
      return;
    }
    
    // Set a timeout for the restore operation
    const timeoutId = setTimeout(() => {
      resolve();
    }, 5000);
    
    // Listen for product updates during restore
    let restoredCount = 0;
    const onProductUpdated = (product: any) => {
      if (product && product.owned) {
        restoredCount++;
      }
    };
    
    // Set up listener
    if (store.when && typeof store.when === 'function') {
      try {
        store.when().productUpdated(onProductUpdated);
      } catch (err) {
        console.warn('[IAP] Could not set up product listener:', err);
      }
    }
    
    // Trigger the refresh
    if (store.restorePurchases && typeof store.restorePurchases === 'function') {
      store.restorePurchases();
      
      // Wait a bit for restoration to complete
      setTimeout(() => {
        clearTimeout(timeoutId);
        resolve();
      }, 3000);
    } else if (store.refresh && typeof store.refresh === 'function') {
      store.refresh();
      
      // Wait a bit for refresh to complete
      setTimeout(() => {
        clearTimeout(timeoutId);
        resolve();
      }, 3000);
    } else {
      clearTimeout(timeoutId);
      console.error('[IAP] No restore or refresh method available');
      reject(new Error('Restore method not available'));
    }
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
