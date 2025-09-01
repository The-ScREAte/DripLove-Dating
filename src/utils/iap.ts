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

export const isNativeApp = () => {
  return Capacitor.isNativePlatform();
};

let storeInitialized = false;
let storeInitializationPromise: Promise<void> | null = null;

const initializeStore = (): Promise<void> => {
  if (storeInitializationPromise) {
    return storeInitializationPromise;
  }

  storeInitializationPromise = new Promise((resolve, reject) => {
    if (!isNativeApp()) {
      reject('IAP only works on native devices');
      return;
    }
    if (window.store && typeof window.store.register === 'function') {
      storeInitialized = true;
      resolve();
      return;
    }
    let attempts = 0;
    const maxAttempts = 100;
    const checkStore = () => {
      attempts++;
      if (window.store && typeof window.store.register === 'function') {
        storeInitialized = true;
        resolve();
        return;
      }
      if (attempts >= maxAttempts) {
        reject('IAP plugin not ready after 10 seconds');
        return;
      }
      setTimeout(checkStore, 100);
    };
    setTimeout(checkStore, 100);
  });
  return storeInitializationPromise;
};

const waitForStore = (): Promise<void> => {
  if (storeInitialized && window.store && typeof window.store.register === 'function') {
    return Promise.resolve();
  }
  return initializeStore();
};

export async function fetchIAPProducts(productIds: string[]): Promise<any[]> {
  try {
    await waitForStore();
    // Use the correct App Store Connect product ID for monthly premium by default if none provided
    const ids = productIds && productIds.length > 0 ? productIds : ['com.driplove.dating.premium.monthly'];
    console.log('[IAP] Fetching products:', ids);
    
    return new Promise((resolve, reject) => {
      window.store.verbosity = window.store.DEBUG;
      const products = ids.map(id => ({ id, type: window.store.PAID_SUBSCRIPTION }));
      console.log('[IAP] Registering products:', products);
      
      window.store.register(products);
      
      window.store.ready(() => {
        console.log('[IAP] Store ready, fetching products...');
        const fetchedProducts = ids.map(id => {
          const product = window.store.get(id);
          console.log(`[IAP] Product ${id}:`, product);
          return product;
        });
        resolve(fetchedProducts);
      });
      
      window.store.error((err: any) => {
        console.error('[IAP] Store error:', err);
        reject(err);
      });
      
      window.store.refresh();
    });
  } catch (error) {
    console.error('[IAP] Fetch products failed:', error);
    throw new Error(`IAP not available: ${error}`);
  }
}

export async function buyIAPProduct(productId: string): Promise<any> {
  try {
    await waitForStore();
    // Use the correct App Store Connect product ID for monthly premium by default if not provided
    const id = productId || 'com.driplove.dating.premium.monthly';
    return new Promise((resolve, reject) => {
      const existingProduct = window.store.get(id);
      if (!existingProduct) {
        window.store.register([{ id, type: window.store.PAID_SUBSCRIPTION }]);
      }
      window.store.ready(() => {
        const product = window.store.get(id);
        if (!product) {
          reject(new Error('Product not found after registration'));
          return;
        }
        if (typeof window.store.order !== 'function') {
          reject(new Error('IAP order function not available'));
          return;
        }
        window.store.when(id).approved((product: any) => {
          product.finish();
          resolve(product);
        });
        window.store.when(id).error((error: any) => {
          reject(error);
        });
        window.store.order(id);
      });
      window.store.error((err: any) => reject(err));
      window.store.refresh();
    });
  } catch (error) {
    throw new Error(`IAP purchase failed: ${error}`);
  }
}