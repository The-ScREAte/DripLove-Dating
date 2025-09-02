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
      console.log('[IAP] approved:', t);
      t.verify();
    });
    store.when().verified(r => {
      console.log('[IAP] verified (granting):', r);
      // TODO: grant entitlement in your app state here
      r.finish();
    });
    // @ts-ignore - Handle cancelled if available (may not exist in all versions)
    const whenObj: any = store.when();
    if (typeof whenObj.cancelled === 'function') {
      whenObj.cancelled((p: any) => console.log('[IAP] cancelled:', p?.id));
    }
    // 3) Initialize AFTER register
    store.initialize([{ platform: Platform.APPLE_APPSTORE, options: { needAppReceipt: true } }]);
    // 4) Ask for product/ownership data
    store.refresh();
  });
}

// Call to purchase from your UI:
export function buyMonthly() {
  // @ts-ignore
  const p = window.CdvPurchase?.store?.get('com.driplove.dating.premium.monthlysub');
  if (!p) return console.warn('[IAP] product not loaded yet');
  const offer = p.getOffer();
  if (!offer) return console.warn('[IAP] no purchasable offer yet');
  offer.order(); // shows Apple purchase sheet (Simulator uses your .storekit)
}

// Call to restore:
export function restorePurchases() {
  // @ts-ignore
  window.CdvPurchase?.store?.refresh();
}
