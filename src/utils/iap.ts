
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

// Initialize the store and wait for it to be ready
let storeInitialized = false;
let storeInitializationPromise: Promise<void> | null = null;

const initializeStore = (): Promise<void> => {
  if (storeInitializationPromise) {
    return storeInitializationPromise;
  }

  storeInitializationPromise = new Promise((resolve, reject) => {
    console.log('[IAP] Starting store initialization...');
    
    if (!isNativeApp()) {
      console.log('[IAP] Not a native app, rejecting');
      reject('IAP only works on native devices');
      return;
    }

    // Check if store is already available
    if (window.store && typeof window.store.register === 'function') {
      console.log('[IAP] Store already available');
      storeInitialized = true;
      resolve();
      return;
    }

    let attempts = 0;
    const maxAttempts = 100; // 10 seconds with 100ms intervals

    const checkStore = () => {
      attempts++;
      console.log(`[IAP] Checking store availability (attempt ${attempts}/${maxAttempts})`);
      
      if (window.store && typeof window.store.register === 'function') {
        console.log('[IAP] Store is now available!');
        storeInitialized = true;
        resolve();
        return;
      }

      if (attempts >= maxAttempts) {
        console.error('[IAP] Store not available after maximum attempts');
        reject('IAP plugin not ready after 10 seconds');
        return;
      }

      setTimeout(checkStore, 100);
    };

    // Start checking immediately for Capacitor
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
    console.log('[IAP] fetchIAPProducts called for:', productIds);
    await waitForStore();
    console.log('[IAP] Store is ready, proceeding with product fetch');
    
    return new Promise((resolve, reject) => {
      window.store.verbosity = window.store.DEBUG;
      
      // Register products
      const products = productIds.map(id => ({ 
        id, 
        type: window.store.PAID_SUBSCRIPTION 
      }));
      
      console.log('[IAP] Registering products:', products);
      window.store.register(products);
      
      window.store.ready(() => {
        console.log('[IAP] Store ready callback triggered');
        const fetchedProducts = productIds.map(id => window.store.get(id));
        console.log('[IAP] Fetched products:', fetchedProducts);
        resolve(fetchedProducts);
      });
      
      window.store.error((err: any) => {
        console.error('[IAP] Store error:', err);
        reject(err);
      });
      
      window.store.refresh();
    });
  } catch (error) {
    console.error('[IAP] fetchIAPProducts error:', error);
    throw new Error(`IAP not available: ${error}`);
  }
}

export async function buyIAPProduct(productId: string): Promise<any> {
  try {
    console.log('[IAP] buyIAPProduct called for:', productId);
    await waitForStore();
    console.log('[IAP] Store is ready, proceeding with purchase');
    
    return new Promise((resolve, reject) => {
      // Register product if not already registered
      const existingProduct = window.store.get(productId);
      console.log('[IAP] Existing product:', existingProduct);
      
      if (!existingProduct) {
        console.log('[IAP] Registering product:', productId);
        window.store.register([{ 
          id: productId, 
          type: window.store.PAID_SUBSCRIPTION 
        }]);
      }
      
      window.store.ready(() => {
        console.log('[IAP] Store ready for purchase');
        const product = window.store.get(productId);
        console.log('[IAP] Product found:', product);
        
        if (!product) {
          console.error('[IAP] Product not found after registration');
          reject(new Error('Product not found after registration'));
          return;
        }
        
        if (typeof window.store.order !== 'function') {
          console.error('[IAP] Order function not available');
          reject(new Error('IAP order function not available'));
          return;
        }
        
        // Set up purchase handlers
        console.log('[IAP] Setting up purchase handlers');
        window.store.when(productId).approved((product: any) => {
          console.log('[IAP] Purchase approved:', product);
          product.finish();
          resolve(product);
        });
        
        window.store.when(productId).error((error: any) => {
          console.error('[IAP] Purchase error:', error);
          reject(error);
        });
        
        // Initiate purchase
        console.log('[IAP] Initiating purchase');
        window.store.order(productId);
      });
      
      window.store.error((err: any) => {
        console.error('[IAP] General store error:', err);
        reject(err);
      });
      
      window.store.refresh();
    });
  } catch (error) {
    console.error('[IAP] buyIAPProduct error:', error);
    throw new Error(`IAP purchase failed: ${error}`);
  }
}
