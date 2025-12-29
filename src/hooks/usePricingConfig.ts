import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PricingConfig {
  price: string;
  monthlyPrice: string;
  currency: string;
  currencySymbol: string;
  displayPrice: string;
  loading: boolean;
  source: 'iap' | 'fallback';
}

// Cache for pricing config
let cachedConfig: PricingConfig | null = null;
let configPromise: Promise<PricingConfig> | null = null;

// Currency symbols map (fallback only)
const currencySymbols: Record<string, string> = {
  USD: '$',
  GHS: '₵',
  GBP: '£',
  EUR: '€',
  NGN: '₦',
  ZAR: 'R',
  KES: 'KSh',
  TZS: 'TSh',
  UGX: 'USh',
  RWF: 'FRw',
  XOF: 'CFA',
  XAF: 'FCFA',
  EGP: 'E£',
  MAD: 'DH',
  INR: '₹',
  CAD: 'C$',
  AUD: 'A$',
};

// Default USD pricing for web (will be loaded from DB)
let webPricing: PricingConfig = {
  price: '',
  monthlyPrice: '',
  currency: 'USD',
  currencySymbol: '$',
  displayPrice: '',
  loading: true,
  source: 'fallback',
};

// Load web pricing from database - uses only default international price
async function loadWebPricingFromDB(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('payment_config')
      .select('default_international_price, default_international_currency')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      const price = data.default_international_price?.toString();
      if (!price) {
        console.error('[Pricing] Missing default_international_price in payment_config; refusing to use hardcoded fallback.');
        return;
      }

      const currency = data.default_international_currency || 'USD';
      const symbol = currencySymbols[currency] || currency;
      
      webPricing = {
        price,
        monthlyPrice: price,
        currency,
        currencySymbol: symbol,
        displayPrice: `${symbol}${price}/month`,
        loading: false,
        source: 'fallback',
      };
      
      console.log('[Pricing] Loaded default international price:', price, currency);
    }
  } catch (error) {
    console.error('[Pricing] Error loading web pricing from DB:', error);
  }
}



// Google Play product IDs (must match iap-google.ts)
const GOOGLE_PRODUCT_IDS = [
  'premium_monthly',
  'com.driplove.dating.premium.monthly',
];

// Apple product IDs (must match iap.ts)
const APPLE_PRODUCT_IDS = [
  'com.driplove.dating.premium.monthlysub3',
  'com.driplove.dating.premium.monthlysub2',
];

// Helper functions using dynamic Capacitor import
const getCapacitor = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor;
  } catch {
    return null;
  }
};

const isNativeApp = async () => {
  const Capacitor = await getCapacitor();
  return Capacitor?.isNativePlatform() ?? false;
};

const isAndroid = async () => {
  const Capacitor = await getCapacitor();
  return Capacitor?.getPlatform() === 'android';
};

const isIOS = async () => {
  const Capacitor = await getCapacitor();
  return Capacitor?.getPlatform() === 'ios';
};

// Extract currency symbol from formatted price string (e.g., "$4.99" -> "$", "₵39.99" -> "₵")
function extractCurrencySymbol(formattedPrice: string): string {
  // Match currency symbols at the start or end of the string
  const match = formattedPrice.match(/^([^\d\s.,]+)|([^\d\s.,]+)$/);
  if (match) {
    return match[1] || match[2] || '';
  }
  return '';
}

// Extract numeric price from formatted price string (e.g., "$4.99" -> "4.99")
function extractNumericPrice(formattedPrice: string): string {
  const match = formattedPrice.match(/[\d.,]+/);
  if (match) {
    // Handle both "4.99" and "4,99" formats
    return match[0].replace(',', '.');
  }
  return '0';
}

// Get Google Play localized price
async function getGooglePrice(): Promise<{ price: string; currency: string; formattedPrice: string } | null> {
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  
  if (!store || !(await isAndroid())) {
    return null;
  }

  // Wait a bit for store to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    for (const id of GOOGLE_PRODUCT_IDS) {
      const product = store.get ? store.get(id) : null;
      
      if (product) {
        // Try different ways to get pricing info
        const pricing = product.pricing;
        
        if (pricing) {
          // Get the raw price and currency from Google Play
          const rawPrice = pricing.price || product.price || '';
          const rawCurrency = pricing.currency || product.priceCurrency || 'USD';
          const numericPrice = extractNumericPrice(rawPrice);
          
          // Google Play returns prices in the user's Play Store country currency
          // which is the correct localized price for the user
          return {
            formattedPrice: rawPrice,
            price: numericPrice,
            currency: rawCurrency,
          };
        }
        
        // Fallback to product.price directly
        if (product.price) {
          const rawCurrency = product.priceCurrency || 'USD';
          return {
            formattedPrice: product.price,
            price: extractNumericPrice(product.price),
            currency: rawCurrency,
          };
        }
      }
    }
  } catch (error) {
    console.error('[Pricing] Error getting Google price:', error);
  }

  return null;
}

// Get Apple StoreKit localized price
async function getApplePrice(): Promise<{ price: string; currency: string; formattedPrice: string } | null> {
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  
  if (!store || !(await isIOS())) {
    return null;
  }

  // Wait a bit for store to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    for (const id of APPLE_PRODUCT_IDS) {
      const product = store.get ? store.get(id) : null;
      
      if (product) {
        // Try different ways to get pricing info
        const pricing = product.pricing;
        
        if (pricing) {
          return {
            formattedPrice: pricing.price || product.price || '',
            price: extractNumericPrice(pricing.price || product.price || ''),
            currency: pricing.currency || 'USD',
          };
        }
        
        // Fallback to product.price directly
        if (product.price) {
          return {
            formattedPrice: product.price,
            price: extractNumericPrice(product.price),
            currency: product.priceCurrency || 'USD',
          };
        }
      }
    }
  } catch (error) {
    console.error('[Pricing] Error getting Apple price:', error);
  }

  return null;
}

// Get IAP price based on platform
async function getIAPPrice(): Promise<{ price: string; currency: string; formattedPrice: string } | null> {
  if (!(await isNativeApp())) {
    return null;
  }

  if (await isAndroid()) {
    return await getGooglePrice();
  }

  if (await isIOS()) {
    return await getApplePrice();
  }

  return null;
}

// Retry getting IAP price with multiple attempts
async function getIAPPriceWithRetry(maxAttempts: number = 5): Promise<{ price: string; currency: string; formattedPrice: string } | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const iapPrice = await getIAPPrice();
    if (iapPrice && iapPrice.price && parseFloat(iapPrice.price) > 0) {
      return iapPrice;
    }
    
    // Wait before retry (exponential backoff: 500ms, 1s, 2s, 4s, 8s)
    if (attempt < maxAttempts) {
      const delay = 500 * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}



// Load pricing config - platform specific
async function loadPricingConfig(userId?: string): Promise<PricingConfig> {
  try {
    const Capacitor = await getCapacitor();
    const platform = Capacitor?.getPlatform() || 'web';
    
    // Load web pricing from database first
    await loadWebPricingFromDB();
    
    // WEB: Use pricing from database
    if (!(await isNativeApp())) {
      console.log('[Pricing] Web platform, using DB pricing');
      return { ...webPricing };
    }
    
    // ANDROID: Use Google Play Console pricing
    if (await isAndroid()) {
      const googlePrice = await getIAPPriceWithRetry(5);
      
      if (googlePrice && googlePrice.formattedPrice) {
        const symbol = extractCurrencySymbol(googlePrice.formattedPrice) || currencySymbols[googlePrice.currency] || googlePrice.currency;
        
        console.log('[Pricing] Android using Google Play IAP:', googlePrice.price, googlePrice.currency);
        
        const config: PricingConfig = {
          price: googlePrice.price,
          monthlyPrice: googlePrice.price,
          currency: googlePrice.currency,
          currencySymbol: symbol,
          displayPrice: googlePrice.formattedPrice + '/month',
          loading: false,
          source: 'iap',
        };
        
        return config;
      }
      
      // Fallback for Android if IAP fails - use database pricing
      console.log('[Pricing] Android IAP failed, using DB fallback:', webPricing.price, webPricing.currency);
      return { ...webPricing };
    }
    
    // iOS: Use App Store pricing
    if (await isIOS()) {
      const applePrice = await getIAPPriceWithRetry(5);
      
      if (applePrice && applePrice.formattedPrice) {
        const symbol = extractCurrencySymbol(applePrice.formattedPrice) || currencySymbols[applePrice.currency] || applePrice.currency;
        
        console.log('[Pricing] iOS using App Store IAP:', applePrice.price, applePrice.currency);
        
        const config: PricingConfig = {
          price: applePrice.price,
          monthlyPrice: applePrice.price,
          currency: applePrice.currency,
          currencySymbol: symbol,
          displayPrice: applePrice.formattedPrice + '/month',
          loading: false,
          source: 'iap',
        };
        
        return config;
      }
      
      // Fallback for iOS if IAP fails - use database pricing
      console.log('[Pricing] iOS IAP failed, using DB fallback:', webPricing.price, webPricing.currency);
      return { ...webPricing };
    }
    
    // Default fallback - use database pricing
    return { ...webPricing };
  } catch (error) {
    console.error('[Pricing] Error loading config:', error);
    return { ...webPricing };
  }
}

// Preload pricing in background (call on login)
export function preloadPricingConfig(userId?: string): void {
  if (cachedConfig || configPromise) return;
  
  configPromise = loadPricingConfig(userId).then(config => {
    cachedConfig = config;
    configPromise = null;
    return config;
  });
}

// Hook to use pricing config - accepts optional userId for country-specific pricing
export function usePricingConfig(userId?: string): PricingConfig {
  const [config, setConfig] = useState<PricingConfig>(
    cachedConfig || { ...webPricing, loading: true }
  );

  useEffect(() => {
    // If already cached and no userId change, use it
    if (cachedConfig && !userId) {
      setConfig(cachedConfig);
      return;
    }

    // If loading in progress, wait for it
    if (configPromise) {
      configPromise.then(setConfig);
      return;
    }

    // Otherwise, load fresh with userId for country-specific pricing
    const loadConfig = async () => {
      const freshConfig = await loadPricingConfig(userId);
      cachedConfig = freshConfig;
      setConfig(freshConfig);
    };

    loadConfig();
  }, [userId]);

  return config;
}

// Clear cache (useful for testing or when user changes country)
export function clearPricingCache(): void {
  cachedConfig = null;
  configPromise = null;
}
