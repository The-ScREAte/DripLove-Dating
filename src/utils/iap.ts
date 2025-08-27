
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

// Wait for the store to be ready
const waitForStore = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!isNativeApp()) {
      reject('IAP only works on native devices');
      return;
    }

    // Check if store is already available
    if (window.store && typeof window.store.register === 'function') {
      resolve();
      return;
    }

    // Wait for deviceready event
    const checkStore = () => {
      if (window.store && typeof window.store.register === 'function') {
        resolve();
      } else {
        setTimeout(checkStore, 100);
      }
    };

    // Start checking after device ready
    if (window.cordova) {
      document.addEventListener('deviceready', checkStore, false);
    } else {
      // Fallback for when cordova isn't detected
      setTimeout(checkStore, 1000);
    }

    // Timeout after 10 seconds
    setTimeout(() => {
      reject('IAP plugin not ready after 10 seconds');
    }, 10000);
  });
};

export async function fetchIAPProducts(productIds: string[]): Promise<any[]> {
  try {
    await waitForStore();
    
    return new Promise((resolve, reject) => {
      window.store.verbosity = window.store.DEBUG;
      
      // Register products
      const products = productIds.map(id => ({ 
        id, 
        type: window.store.PAID_SUBSCRIPTION 
      }));
      
      window.store.register(products);
      
      window.store.ready(() => {
        const fetchedProducts = productIds.map(id => window.store.get(id));
        resolve(fetchedProducts);
      });
      
      window.store.error((err: any) => reject(err));
      window.store.refresh();
    });
  } catch (error) {
    throw new Error(`IAP not available: ${error}`);
  }
}

export async function buyIAPProduct(productId: string): Promise<any> {
  try {
    await waitForStore();
    
    return new Promise((resolve, reject) => {
      // Register product if not already registered
      const existingProduct = window.store.get(productId);
      if (!existingProduct) {
        window.store.register([{ 
          id: productId, 
          type: window.store.PAID_SUBSCRIPTION 
        }]);
      }
      
      window.store.ready(() => {
        const product = window.store.get(productId);
        if (!product) {
          reject(new Error('Product not found after registration'));
          return;
        }
        
        if (typeof window.store.order !== 'function') {
          reject(new Error('IAP order function not available'));
          return;
        }
        
        // Set up purchase handlers
        window.store.when(productId).approved((product: any) => {
          product.finish();
          resolve(product);
        });
        
        window.store.when(productId).error((error: any) => {
          reject(error);
        });
        
        // Initiate purchase
        window.store.order(productId);
      });
      
      window.store.error((err: any) => reject(err));
      window.store.refresh();
    });
  } catch (error) {
    throw new Error(`IAP purchase failed: ${error}`);
  }
}
