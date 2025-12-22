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
    // Support both possible product IDs if none provided
    const defaultIds = [
      'com.driplove.dating.premium.monthlysub2',
      'com.driplove.dating.premium.monthlysub3'
    ];
    const ids = productIds && productIds.length > 0 ? productIds : defaultIds;
    
    return new Promise((resolve, reject) => {
      window.store.verbosity = window.store.DEBUG;
      const products = ids.map(id => ({ id, type: window.store.PAID_SUBSCRIPTION }));
      
      window.store.register(products);
      
      window.store.ready(() => {
        const fetchedProducts = ids.map(id => {
          const product = window.store.get(id);
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
    // Support both possible product IDs - try to find which one is available
    const possibleIds = [
      'com.driplove.dating.premium.monthlysub2',
      'com.driplove.dating.premium.monthlysub3'
    ];
    
    // If specific productId provided, use it; otherwise try to find available one
    const idsToTry = productId ? [productId] : possibleIds;
    
    return new Promise((resolve, reject) => {
      // Register all possible products
      possibleIds.forEach(id => {
        const existingProduct = window.store.get(id);
        if (!existingProduct) {
          window.store.register([{ id, type: window.store.PAID_SUBSCRIPTION }]);
        }
      });
      
      window.store.ready(() => {
        // Find first available product
        let product = null;
        let selectedId = null;
        
        for (const id of idsToTry) {
          const p = window.store.get(id);
          if (p && p.canPurchase) {
            product = p;
            selectedId = id;
            break;
          }
        }
        
        if (!product || !selectedId) {
          reject(new Error('No valid subscription product available'));
          return;
        }
        if (typeof window.store.order !== 'function') {
          reject(new Error('IAP order function not available'));
          return;
        }
        window.store.when(selectedId).approved((product: any) => {
          product.finish();
          resolve(product);
        });
        window.store.when(selectedId).error((error: any) => {
          reject(error);
        });
        window.store.order(selectedId);
      });
      window.store.error((err: any) => reject(err));
      window.store.refresh();
    });
  } catch (error) {
    throw new Error(`IAP purchase failed: ${error}`);
  }
}