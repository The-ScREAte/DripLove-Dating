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
    // 2) Observe lifecycle (so we can see loading, purchase, verify)
    store.error(e => console.warn('[IAP] error:', e?.code, e?.message));
    store.when().productUpdated(p =>
      console.log('[IAP] productUpdated:', p?.id, p?.title, p?.pricing?.price)
    );
    store.when().approved(t => {
      console.log('[IAP] approved:', t.productId);
      t.verify();
    });
    store.when().verified(async (r) => {
      console.log('[IAP] verified (granting):', r.productId);
      
      // Grant entitlement in your app state here
      try {
        // Update database with premium subscription
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          const subscriptionData = {
            user_id: user.id,
            plan_name: 'premium',
            status: 'active',
            flutterwave_transaction_id: (r as any).transactionId || null,
            starts_at: new Date().toISOString(),
            expires_at: expiryDate.toISOString(),
            next_billing_date: expiryDate.toISOString(),
            auto_renew: true,
            payment_method: 'apple',
            updated_at: new Date().toISOString(),
          };

          // Check if user already has a subscription
          const { data: existingSubscription } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (existingSubscription) {
            await supabase
              .from('user_subscriptions')
              .update({
                ...subscriptionData,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', user.id);
          } else {
            await supabase
              .from('user_subscriptions')
              .insert([subscriptionData]);
          }

          // Redirect to success page
          window.location.href = '/payment-success?status=successful&payment_type=iap';
        }
      } catch (error) {
        console.error('[IAP] Error updating subscription:', error);
      }
      
      r.finish();
    });
    // 3) Initialize AFTER register
    store.initialize([{ platform: Platform.APPLE_APPSTORE, options: { needAppReceipt: true } }]);
    // 4) Ask for product/ownership data
    store.refresh();
  });
}

// Call to purchase from your UI:
export function buyMonthly(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // @ts-ignore
      const store = window.CdvPurchase?.store;
      if (!store) {
        reject(new Error('[IAP] CdvPurchase.store not available'));
        return;
      }

      const p = store.get('com.driplove.dating.premium.monthlysub');
      if (!p) {
        reject(new Error('[IAP] product not loaded yet'));
        return;
      }

      const offer = p.getOffer();
      if (!offer) {
        reject(new Error('[IAP] no purchasable offer yet'));
        return;
      }

      console.log('[IAP] Starting purchase for:', p.id);
      
      // The global verified handler will handle the success
      // and redirect to the payment success page
      offer.order(); // shows Apple purchase sheet (Simulator uses your .storekit)
      
      // For now, just resolve immediately after initiating the purchase
      // The actual completion will be handled by the global verified handler
      resolve();
    } catch (error) {
      console.error('[IAP] Error in buyMonthly:', error);
      reject(error);
    }
  });
}

// Call to restore:
export function restorePurchases() {
  // @ts-ignore
  window.CdvPurchase?.store?.refresh();
}
