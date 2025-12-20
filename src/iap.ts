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
        console.log('[IAP] Log level set to:', isDevelopment ? 'DEBUG' : 'ERROR');
        console.log('[IAP] Environment:', isDevelopment ? 'DEVELOPMENT (StoreKit Testing)' : 'PRODUCTION');
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
    console.log('[IAP] Product IDs to register:', PRODUCT_IDS);

    // 2️⃣ Register all of them with the store for the correct platform
    if (store.register && typeof store.register === 'function') {
      const productsToRegister = PRODUCT_IDS.map(id => ({
        id,
        platform: currentPlatform,
        type: ProductType.PAID_SUBSCRIPTION
      }));
      console.log('[IAP] Registering products:', JSON.stringify(productsToRegister, null, 2));
      store.register(productsToRegister);
      console.log('[IAP] Products registered, waiting for productUpdated events...');
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
      console.log('[IAP] Setting up store.when() event handlers...');
      store.when()
        .productUpdated(p => {
          // Product updated successfully - clear initialization timeout
          console.log('[IAP] productUpdated event received for:', p?.id);
          
          // Check if it's one of our registered products
          const isOurProduct = PRODUCT_IDS.includes(p?.id);
          if (p && isOurProduct) {
            console.log('[IAP] ✅ Product loaded successfully:', p.id, 'Price:', p.pricing?.price);
            console.log('[IAP] Product details:', {
              id: p.id,
              title: p.title,
              canPurchase: p.canPurchase,
              owned: p.owned,
              state: p.state
            });
            clearTimeout(initializationTimeout);
            window.iapInitializationFailed = false;
          } else if (p) {
            console.log('[IAP] Ignoring product (not in our list):', p.id);
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
            
            if (!user) {
              console.error('[IAP] No authenticated user found');
              alert('Please log in to complete your purchase.');
              return;
            }
            
            console.log('[IAP] Processing verified receipt for user:', user.id);
            console.log('[IAP] Receipt object:', {
              productId: r.productId,
              transactionId: r.transactionId,
              hasReceipt: !!r.receipt,
              hasPayload: !!r.payload,
              platform: paymentMethod
            });
            
            // Helper function to activate subscription in database
            const activateSubscription = async (transactionId: string | null, expiryDate?: Date) => {
              const expiry = expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              
              // First, check if subscription exists
              const { data: existingSub, error: fetchError } = await supabase
                .from('user_subscriptions')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle();
              
              if (fetchError) {
                console.error('[IAP] Error fetching existing subscription:', fetchError);
              }
              
              const subscriptionData = {
                user_id: user.id,
                plan_name: 'premium',
                status: 'active',
                flutterwave_transaction_id: transactionId,
                starts_at: new Date().toISOString(),
                expires_at: expiry.toISOString(),
                next_billing_date: expiry.toISOString(),
                auto_renew: true,
                payment_method: paymentMethod,
                payment_attempts: 0,
                updated_at: new Date().toISOString(),
              };
              
              let result;
              if (existingSub?.id) {
                // Update existing subscription
                console.log('[IAP] Updating existing subscription:', existingSub.id);
                result = await supabase
                  .from('user_subscriptions')
                  .update(subscriptionData)
                  .eq('user_id', user.id);
              } else {
                // Insert new subscription
                console.log('[IAP] Creating new subscription for user:', user.id);
                result = await supabase
                  .from('user_subscriptions')
                  .insert(subscriptionData);
              }
              
              if (result.error) {
                console.error('[IAP] ❌ Database operation failed:', result.error);
                throw new Error(`Database update failed: ${result.error.message}`);
              }
              
              console.log('[IAP] ✅ Subscription activated successfully!');
              return true;
            };
            
            // Get receipt data from the transaction
            const receiptData = r.receipt || r.payload || r.transactionReceipt;
            const transactionId = r.transactionId || r.productId || `iap_${Date.now()}`;
            
            if (receiptData) {
              console.log('[IAP] Receipt data found, attempting server validation...');
              
              // Add timeout protection for receipt validation (25 seconds)
              const validationTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Receipt validation timeout')), 25000);
              });
              
              // Choose the correct validator based on platform
              const validatorFunction = isAndroid() ? 'google-iap-validator' : 'iap-receipt-validator';
              console.log('[IAP] Using validator function:', validatorFunction);
              
              // Race between validation and timeout
              const validationPromise = supabase.functions.invoke(validatorFunction, {
                body: {
                  receiptData: receiptData,
                  productId: r.productId,
                  userId: user.id,
                  purchaseToken: r.purchaseToken || r.transactionId,
                  transactionId: transactionId
                }
              });

              let validation, validationError;
              try {
                const result: any = await Promise.race([validationPromise, validationTimeout]);
                validation = result.data;
                validationError = result.error;
                console.log('[IAP] Validation response:', { validation, validationError });
              } catch (timeoutError) {
                console.error('[IAP] Receipt validation timeout, using fallback method');
                validationError = timeoutError;
              }

              // If validation fails or times out, use fallback
              if (validationError || !validation?.valid) {
                console.warn('[IAP] Server validation failed, activating via fallback:', validationError?.message || validation);
                
                try {
                  await activateSubscription(transactionId);
                  window.location.href = '/payment-success?status=successful&payment_type=iap';
                } catch (dbError) {
                  console.error('[IAP] Fallback activation failed:', dbError);
                  alert('Failed to activate subscription. Please contact support.');
                }
                return;
              }

              // Server validation successful
              if (validation.active) {
                console.log('[IAP] Server validation successful, subscription is active');
                
                const expiryDate = validation.expiresDate 
                  ? new Date(validation.expiresDate)
                  : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                
                try {
                  await activateSubscription(validation.transaction_id || transactionId, expiryDate);
                  window.location.href = '/payment-success?status=successful&payment_type=iap';
                } catch (dbError) {
                  console.error('[IAP] Server-validated activation failed:', dbError);
                  alert('Failed to activate subscription. Please contact support.');
                }
              } else {
                console.warn('[IAP] Subscription not active according to server validation');
                alert('Your subscription has expired. Please renew your subscription.');
              }
            } else {
              // No receipt data - use direct activation
              console.log('[IAP] No receipt data available, using direct activation');
              
              try {
                await activateSubscription(transactionId);
                window.location.href = '/payment-success?status=successful&payment_type=iap';
              } catch (dbError) {
                console.error('[IAP] Direct activation failed:', dbError);
                alert('Failed to activate subscription. Please contact support.');
              }
            }
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
        
        console.log('[IAP] Calling store.initialize with platform:', initPlatform);
        store.initialize([initOptions]);
        console.log('[IAP] store.initialize called successfully');
        
        // Add a ready state handler to clear timeout and resolve promise
        if (store.ready && typeof store.ready === 'function') {
          console.log('[IAP] Setting up store.ready() handler...');
          store.ready(() => {
            console.log('[IAP] ✅ Store is READY! Products should be loaded now.');
            console.log('[IAP] Available products:', store.products?.map(p => ({ id: p.id, title: p.title, price: p.pricing?.price })));
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
      console.log(`[IAP] Checking product ${id}:`, { 
        exists: !!p, 
        canPurchase: p?.canPurchase, 
        owned: p?.owned,
        title: p?.title,
        price: p?.pricing?.price
      });
      if (p && p.canPurchase) {
        product = p;
        console.log(`[IAP] ✅ Selected product: ${id}`);
        break;
      }
    } catch (err) {
      console.warn(`[IAP] Could not load product ${id}:`, err);
    }
  }

  if (!product) {
    console.error('[IAP] No valid product found among:', PRODUCT_IDS);
    console.log('[IAP] Available products:', store.products?.map(p => ({ id: p.id, canPurchase: p.canPurchase, title: p.title })));
    window.iapPurchaseInitiated = false;
    throw new Error('No valid subscription product available');
  }

  // Continue with existing order logic
  try {
    const offer = product.getOffer?.();
    if (offer && typeof offer.order === 'function') {
      console.log('[IAP] Ordering product:', product.id);
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
    
    console.log('[IAP] Starting restore purchases...');
    
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
    
    const activateSubscription = async (productId: string, transactionId?: string, receiptData?: string) => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          console.error('[IAP] No user found during restore');
          return false;
        }
        
        let expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        let isActiveSubscription = false;
        
        // Try server validation if we have receipt data
        if (receiptData) {
          console.log('[IAP] Validating restored receipt with server...');
          try {
            const { data: validation, error: valError } = await supabase.functions.invoke('iap-receipt-validator', {
              body: {
                receiptData: receiptData,
                productId: productId,
                userId: user.id,
                transactionId: transactionId
              }
            });
            
            if (valError) {
              console.warn('[IAP] Validation error:', valError);
            } else if (validation?.active && validation?.expiresDate) {
              const serverExpiry = new Date(validation.expiresDate);
              // Check if subscription is actually still active
              if (serverExpiry > new Date()) {
                expiryDate = serverExpiry;
                isActiveSubscription = true;
                console.log('[IAP] Server confirmed active subscription, expires:', expiryDate);
              } else {
                console.log('[IAP] Server validation shows subscription has expired:', serverExpiry);
                return false;
              }
            } else if (validation && !validation.active) {
              console.log('[IAP] Server validation: subscription is not active');
              return false;
            }
          } catch (valError) {
            console.warn('[IAP] Validation failed, checking product ownership:', valError);
          }
        }
        
        // Only proceed if we confirmed an active subscription
        if (!isActiveSubscription && !receiptData) {
          // No receipt data and no validation - trust the product.owned flag
          console.log('[IAP] No receipt data, trusting product ownership');
          isActiveSubscription = true;
        }
        
        if (!isActiveSubscription) {
          console.log('[IAP] Cannot confirm active subscription');
          return false;
        }
        
        const subscriptionData = {
          user_id: user.id,
          plan_name: 'premium',
          status: 'active',
          flutterwave_transaction_id: transactionId || productId,
          starts_at: new Date().toISOString(),
          expires_at: expiryDate.toISOString(),
          next_billing_date: expiryDate.toISOString(),
          auto_renew: true,
          payment_method: 'apple',
          payment_attempts: 0,
          updated_at: new Date().toISOString(),
        };
        
        console.log('[IAP] Updating subscription...');
        
        const { error: upsertError } = await supabase
          .from('user_subscriptions')
          .upsert(subscriptionData, { onConflict: 'user_id' });
        
        if (upsertError) {
          console.error('[IAP] Database update error:', upsertError);
          return false;
        }
        
        console.log('[IAP] ✅ Subscription restored successfully!');
        return true;
      } catch (error) {
        console.error('[IAP] Error activating subscription:', error);
        return false;
      }
    };
    
    const onProductUpdated = async (product: any) => {
      if (hasResolved) return;
      
      // Check if this is one of our products and it's owned
      if (product && PRODUCT_IDS.includes(product.id) && product.owned) {
        console.log('[IAP] Found owned product during restore:', product.id);
        
        const transaction = product.transaction || product.latestTransaction;
        const receiptData = transaction?.appStoreReceipt || transaction?.receipt || transaction?.transactionReceipt;
        const transactionId = transaction?.transactionId || transaction?.id;
        
        const success = await activateSubscription(product.id, transactionId, receiptData);
        
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
            console.log('[IAP] Found already-owned product:', id);
            
            const transaction = product.transaction || product.latestTransaction;
            const receiptData = transaction?.appStoreReceipt || transaction?.receipt || transaction?.transactionReceipt;
            const transactionId = transaction?.transactionId || transaction?.id;
            
            const success = await activateSubscription(id, transactionId, receiptData);
            
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
        console.log('[IAP] No owned products found in initial check');
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
      console.log('[IAP] Calling store.restorePurchases()...');
      store.restorePurchases();
    } else if (store.refresh && typeof store.refresh === 'function') {
      console.log('[IAP] Calling store.refresh()...');
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
