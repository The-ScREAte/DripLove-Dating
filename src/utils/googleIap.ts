import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE, type Product, type Transaction } from '@capgo/native-purchases';

// TypeScript declaration for global flags
declare global {
  interface Window {
    googleIapInitializationFailed?: boolean;
    googleIapPurchaseInitiated?: boolean;
  }
}

// Product ID for Google Play - must match your Google Play Console product ID
const GOOGLE_PRODUCT_ID = 'premium_monthly';

export const isAndroid = () => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

let googleIapInitialized = false;
let googleIapInitializationPromise: Promise<void> | null = null;

/**
 * Initialize Google Play Billing
 */
export async function initGoogleIAP(): Promise<void> {
  if (!isAndroid()) {
    console.log('[Google IAP] Not on Android, skipping initialization');
    return;
  }

  if (googleIapInitializationPromise) {
    return googleIapInitializationPromise;
  }

  googleIapInitializationPromise = new Promise<void>(async (resolve) => {
    try {
      console.log('[Google IAP] Initializing...');
      
      // Check if billing is supported
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      
      if (!isBillingSupported) {
        console.error('[Google IAP] Billing not supported on this device');
        window.googleIapInitializationFailed = true;
        resolve();
        return;
      }

      // Set up transaction update listener for iOS-style events (not available on Android, but safe to call)
      try {
        NativePurchases.addListener('transactionUpdated', async (transaction: Transaction) => {
          console.log('[Google IAP] Transaction updated:', transaction);
          
          // Check if purchase is valid
          if (transaction.purchaseState === '1') {
            await handleGooglePurchaseSuccess(transaction);
          }
        });
      } catch (listenerError) {
        // Listener might not be available on Android, that's okay
        console.log('[Google IAP] Transaction listener not available (Android expected)');
      }

      googleIapInitialized = true;
      window.googleIapInitializationFailed = false;
      console.log('[Google IAP] Initialization complete');
      resolve();
    } catch (error) {
      console.error('[Google IAP] Initialization failed:', error);
      window.googleIapInitializationFailed = true;
      resolve(); // Resolve to not block app
    }
  });

  return googleIapInitializationPromise;
}

/**
 * Fetch Google Play products with localized prices
 */
export async function loadGoogleProducts(): Promise<{
  id: string;
  price: string;
  currency: string;
  priceMicros: number;
  title: string;
  description: string;
} | null> {
  if (!isAndroid()) {
    return null;
  }

  try {
    console.log('[Google IAP] Loading products...');
    const result = await NativePurchases.getProducts({
      productIdentifiers: [GOOGLE_PRODUCT_ID],
      productType: PURCHASE_TYPE.SUBS,
    });

    console.log('[Google IAP] Products loaded:', result);

    if (!result || !result.products || result.products.length === 0) {
      console.warn('[Google IAP] No products found');
      return null;
    }

    const product: Product = result.products[0];

    return {
      id: product.identifier,
      price: product.priceString || `${product.currencySymbol}${product.price}`,
      currency: product.currencyCode || 'USD',
      priceMicros: product.price ? Math.round(product.price * 1000000) : 0,
      title: product.title || 'Premium Monthly',
      description: product.description || 'Premium subscription',
    };
  } catch (error) {
    console.error('[Google IAP] Failed to load products:', error);
    return null;
  }
}

/**
 * Check if Google IAP is ready
 */
export function isGoogleIapReady(): boolean {
  return isAndroid() && googleIapInitialized && !window.googleIapInitializationFailed;
}

/**
 * Purchase premium subscription via Google Play
 */
export async function buyGooglePremium(): Promise<Transaction> {
  if (!isAndroid()) {
    throw new Error('Google IAP only works on Android');
  }

  if (!googleIapInitialized) {
    await initGoogleIAP();
  }

  window.googleIapPurchaseInitiated = true;

  try {
    console.log('[Google IAP] Starting purchase for:', GOOGLE_PRODUCT_ID);
    
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: GOOGLE_PRODUCT_ID,
      productType: PURCHASE_TYPE.SUBS,
    });

    console.log('[Google IAP] Purchase result:', transaction);
    
    // Check if purchase was successful (purchaseState === "1" means purchased)
    if (transaction.purchaseState === '1') {
      await handleGooglePurchaseSuccess(transaction);
    }

    window.googleIapPurchaseInitiated = false;
    return transaction;
  } catch (error: any) {
    window.googleIapPurchaseInitiated = false;
    
    // Check if user cancelled
    const errorMessage = error?.message?.toLowerCase() || '';
    if (errorMessage.includes('cancel') || error?.code === 'USER_CANCELLED' || error?.code === 1) {
      console.log('[Google IAP] User cancelled purchase');
      throw new Error('User cancelled');
    }
    
    console.error('[Google IAP] Purchase failed:', error);
    throw error;
  }
}

/**
 * Handle successful Google purchase - update Supabase
 */
async function handleGooglePurchaseSuccess(transaction: Transaction): Promise<void> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('[Google IAP] No user found for subscription update');
      return;
    }

    console.log('[Google IAP] Updating subscription for user:', user.id);

    // Calculate expiry date (30 days from now for monthly subscription)
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    const subscriptionData = {
      user_id: user.id,
      plan_name: 'premium',
      status: 'active',
      flutterwave_transaction_id: transaction.transactionId || transaction.orderId || GOOGLE_PRODUCT_ID,
      starts_at: new Date().toISOString(),
      expires_at: expiryDate.toISOString(),
      next_billing_date: expiryDate.toISOString(),
      auto_renew: true,
      payment_method: 'google',
      payment_attempts: 0,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_subscriptions')
      .upsert(subscriptionData, { onConflict: 'user_id' });

    if (error) {
      console.error('[Google IAP] Failed to update subscription:', error);
      throw error;
    }

    console.log('[Google IAP] Subscription updated successfully');
    
    // Redirect to success page
    window.location.href = '/payment-success?status=successful&payment_type=google_iap';
  } catch (error) {
    console.error('[Google IAP] Error handling purchase success:', error);
    throw error;
  }
}

/**
 * Restore Google Play purchases
 */
export async function restoreGooglePurchases(): Promise<void> {
  if (!isAndroid()) {
    throw new Error('Google IAP only works on Android');
  }

  try {
    console.log('[Google IAP] Restoring purchases...');
    
    await NativePurchases.restorePurchases();
    
    // Get purchases to check for active subscriptions
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
    });

    console.log('[Google IAP] Restored purchases:', purchases);

    // Check for active premium subscription
    const premiumPurchase = purchases.find(
      (p) => p.productIdentifier === GOOGLE_PRODUCT_ID && p.purchaseState === '1'
    );

    if (premiumPurchase) {
      await handleGooglePurchaseSuccess(premiumPurchase);
    }
  } catch (error) {
    console.error('[Google IAP] Restore failed:', error);
    throw error;
  }
}

/**
 * Get product info with cached loading
 */
let cachedProduct: {
  id: string;
  price: string;
  currency: string;
  priceMicros: number;
  title: string;
  description: string;
} | null = null;

export async function getGoogleProductPrice(): Promise<string | null> {
  if (cachedProduct) {
    return cachedProduct.price;
  }
  
  const product = await loadGoogleProducts();
  if (product) {
    cachedProduct = product;
    return product.price;
  }
  
  return null;
}
