
import { InAppPurchase2 } from '@awesome-cordova-plugins/in-app-purchase-2';
import { Capacitor } from '@capacitor/core';

// TypeScript declaration for window.store (Cordova IAP plugin)
declare global {
  interface Window {
    store: any;
  }
}

export const isIOS = () => {
  if (Capacitor.getPlatform() === 'ios') return true;
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  return false;
};

export async function fetchIAPProducts(productIds: string[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!window.cordova || !window.store) {
      reject('IAP not available');
      return;
    }
    window.store.verbosity = window.store.DEBUG;
    window.store.register(productIds.map(id => ({ id, type: window.store.PAID_SUBSCRIPTION })));
    window.store.ready(() => {
      const products = productIds.map(id => window.store.get(id));
      resolve(products);
    });
    window.store.error((err: any) => reject(err));
    window.store.refresh();
  });
}

export async function buyIAPProduct(productId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!window.cordova || !window.store) {
      reject('IAP not available');
      return;
    }
    window.store.order(productId).then(resolve).catch(reject);
  });
}
