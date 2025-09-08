import 'cordova-plugin-purchase';

export function initIAP() {
  document.addEventListener('deviceready', () => {
    // @ts-ignore
    const { store, LogLevel, Platform, ProductType, log } = window.CdvPurchase || {};
    if (!store) {
      console.error('CdvPurchase.store not available!');
      return;
    }
    if (log && LogLevel && typeof log.setLevel === 'function') {
      log.setLevel(LogLevel.DEBUG);
    }
    
    // 1) Register EXACT product IDs (must match your .storekit file)
    if (store.register && typeof store.register === 'function') {
      store.register([
        {
          id: 'com.driplove.dating.premium.monthlysub',
          platform: Platform.APPLE_APPSTORE,
          type: ProductType.PAID_SUBSCRIPTION
        },
        {
          id: 'com.driplove.dating.premium.lifetime',
          platform: Platform.APPLE_APPSTORE,
          type: ProductType.NON_CONSUMABLE
        }
      ]);
    } else {
      console.error('[IAP] store.register not available');
    }

    // 2) Global error handler (covers user cancel + other errors)
    if (store.error && typeof store.error === 'function') {
      store.error(e => {
        console.warn('[IAP] error:', e?.code, e?.message, e);
        // Reset loading state on error
        window.iapPurchaseInitiated = false;
      });
    }
    
    // 3) Core lifecycle - using the correct API structure
    if (store.when && typeof store.when === 'function') {
      store.when()
        .productUpdated(p => {
          console.log('[IAP] productUpdated:', p?.id, p?.title, p?.pricing?.price, 'state:', p?.state);
          const offer = p?.getOffer?.();
          console.log('[IAP] offer available:', !!offer, offer);
        })
        .approved(t => {
          console.log('[IAP] approved:', t.productId);
          console.log('[IAP] Purchase initiated by user:', !!window.iapPurchaseInitiated);
          
          // Only verify if user explicitly initiated the purchase
          if (window.iapPurchaseInitiated) {
            console.log('[IAP] Verifying transaction...');
            if (t.verify && typeof t.verify === 'function') {
              t.verify();
            }
          } else {
            console.log('[IAP] Skipping auto-verification - purchase not initiated by user');
            if (t.finish && typeof t.finish === 'function') {
              t.finish();
            }
          }
        })
        .verified(async (r) => {
          console.log('[IAP] verified (granting):', r.productId);
          
          // Reset the purchase flag
          window.iapPurchaseInitiated = false;
          
          // Validate receipt with server-side function for security
          try {
            const { supabase } = await import('@/integrations/supabase/client');
            const { data: { user } } = await supabase.auth.getUser();
            
            if (user) {
              // Get receipt data from the transaction
              const receiptData = r.receipt || r.payload || r.transactionReceipt;
              
              if (receiptData) {
                console.log('[IAP] Validating receipt with server');
                
                // Validate receipt with server-side function
                const { data: validation, error: validationError } = await supabase.functions.invoke('iap-receipt-validator', {
                  body: {
                    receiptData: receiptData,
                    productId: r.productId,
                    userId: user.id
                  }
                });

                if (validationError || !validation?.valid) {
                  console.error('[IAP] Receipt validation failed:', validationError || validation);
                  // Handle failed validation - downgrade to free
                  await supabase.rpc('handle_payment_failure', {
                    p_user_id: user.id,
                    p_reason: 'IAP receipt validation failed'
                  });
                  
                  alert('Payment verification failed. Please contact support if this persists.');
                  return;
                }

                if (validation.active) {
                  console.log('[IAP] Receipt validated successfully');
                  
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
                  console.log('[IAP] Receipt valid but subscription inactive');
                  alert('Your subscription has expired. Please renew your subscription.');
                }
              } else {
                // Fallback: Direct database update if no receipt data available
                console.log('[IAP] No receipt data available, using fallback method');
                
                const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                const subscriptionData = {
                  user_id: user.id,
                  plan_name: 'premium',
                  status: 'active',
                  flutterwave_transaction_id: r.productId || null,
                  starts_at: new Date().toISOString(),
                  expires_at: expiryDate.toISOString(),
                  next_billing_date: expiryDate.toISOString(),
                  auto_renew: true,
                  payment_method: 'apple',
                  payment_attempts: 0, // Reset payment attempts
                  updated_at: new Date().toISOString(),
                };

                // Upsert subscription
                await supabase
                  .from('user_subscriptions')
                  .upsert(subscriptionData, { onConflict: 'user_id' });

                console.log('[IAP] Subscription updated successfully (fallback)');
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

    // 4) Initialize AFTER register, then refresh
    if (store.initialize && typeof store.initialize === 'function') {
      store.initialize([{ platform: Platform.APPLE_APPSTORE, options: { needAppReceipt: true } }]);
    }
    
    if (store.refresh && typeof store.refresh === 'function') {
      store.refresh();
    }
  });
}

// Call to purchase from your UI:
export async function buyMonthly() {
  // @ts-ignore
  const { store } = window.CdvPurchase || {};
  const id = 'com.driplove.dating.premium.monthlysub';

  if (!store) {
    console.warn('[IAP] CdvPurchase.store not available');
    throw new Error('[IAP] CdvPurchase.store not available');
  }

  if (!store.get || typeof store.get !== 'function') {
    console.warn('[IAP] store.get method not available');
    throw new Error('[IAP] store.get method not available');
  }

  const p = store.get(id);
  if (!p) {
    console.warn('[IAP] product not loaded yet');
    throw new Error('[IAP] Product not loaded yet. Please wait for products to load.');
  }

  const offer = p.getOffer?.();
  if (!offer) {
    console.warn('[IAP] no purchasable offer yet (wait for productUpdated). p.state=', p?.state);
    throw new Error('[IAP] No purchasable offer available. Product state: ' + p?.state);
  }

  console.log('[IAP] Starting purchase for:', p.id);
  console.log('[IAP] Product details:', { 
    id: p.id, 
    title: p.title, 
    price: p.pricing?.price, 
    state: p.state,
    offerAvailable: !!offer 
  });
  
  // Set flag to indicate user initiated this purchase
  window.iapPurchaseInitiated = true;
  
  try {
    await offer.order();
  } catch (e: any) {
    console.error('[IAP] order() failed:', {
      code: e?.code,
      message: e?.message,
      error: e
    });
    // Reset flag on error
    window.iapPurchaseInitiated = false;
    throw e;
  }
}

// Call to restore:
export function restorePurchases() {
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  if (store && store.refresh && typeof store.refresh === 'function') {
    store.refresh();
  } else {
    console.warn('[IAP] Cannot restore purchases - store.refresh not available');
  }
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
    product = store.get ? store.get('com.driplove.dating.premium.monthlysub') : null;
    offer = product?.getOffer?.();
  } catch (error) {
    console.error('[IAP Debug] Error getting product:', error);
  }
  
  console.log('[IAP Debug] Current state:', {
    storeAvailable: !!store,
    getMethodAvailable: !!store.get,
    productLoaded: !!product,
    productId: product?.id,
    productTitle: product?.title,
    productPrice: product?.pricing?.price,
    productState: product?.state,
    offerAvailable: !!offer,
    offerType: offer?.constructor?.name,
    purchaseInitiated: !!window.iapPurchaseInitiated,
    cdvPurchaseGlobal: !!window.CdvPurchase
  });
  
  // Also log all products
  try {
    const allProducts = store.products || [];
    console.log('[IAP Debug] All products:', allProducts.map((p: any) => ({
      id: p.id,
      state: p.state,
      hasOffer: !!p.getOffer?.()
    })));
  } catch (error) {
    console.warn('[IAP Debug] Error getting all products:', error);
  }
}
