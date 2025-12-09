import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

interface PricingConfig {
  price: string;
  monthlyPrice: string;
  currency: string;
  currencySymbol: string;
  displayPrice: string;
  ghsPrice: string;
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

// Default USD pricing for web
const webPricing: PricingConfig = {
  price: '1.99',
  monthlyPrice: '1.99',
  currency: 'USD',
  currencySymbol: '$',
  displayPrice: '$1.99/month',
  ghsPrice: '32',
  loading: false,
  source: 'fallback',
};

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

// Check if running as native app
const isNativeApp = () => {
  return Capacitor.isNativePlatform();
};

const isAndroid = () => {
  return Capacitor.getPlatform() === 'android';
};

const isIOS = () => {
  return Capacitor.getPlatform() === 'ios';
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
  
  if (!store || !isAndroid()) {
    return null;
  }

  // Wait a bit for store to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    for (const id of GOOGLE_PRODUCT_IDS) {
      const product = store.get ? store.get(id) : null;
      console.log(`[Pricing] Checking Google product ${id}:`, product);
      
      if (product) {
        // Try different ways to get pricing info
        const pricing = product.pricing;
        
        if (pricing) {
          console.log('[Pricing] Found Google pricing:', pricing);
          return {
            formattedPrice: pricing.price || product.price || '',
            price: extractNumericPrice(pricing.price || product.price || ''),
            currency: pricing.currency || 'USD',
          };
        }
        
        // Fallback to product.price directly
        if (product.price) {
          console.log('[Pricing] Using product.price:', product.price);
          return {
            formattedPrice: product.price,
            price: extractNumericPrice(product.price),
            currency: product.priceCurrency || 'USD',
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
  
  if (!store || !isIOS()) {
    return null;
  }

  // Wait a bit for store to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    for (const id of APPLE_PRODUCT_IDS) {
      const product = store.get ? store.get(id) : null;
      console.log(`[Pricing] Checking Apple product ${id}:`, product);
      
      if (product) {
        // Try different ways to get pricing info
        const pricing = product.pricing;
        
        if (pricing) {
          console.log('[Pricing] Found Apple pricing:', pricing);
          return {
            formattedPrice: pricing.price || product.price || '',
            price: extractNumericPrice(pricing.price || product.price || ''),
            currency: pricing.currency || 'USD',
          };
        }
        
        // Fallback to product.price directly
        if (product.price) {
          console.log('[Pricing] Using product.price:', product.price);
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
  if (!isNativeApp()) {
    return null;
  }

  if (isAndroid()) {
    return await getGooglePrice();
  }

  if (isIOS()) {
    return await getApplePrice();
  }

  return null;
}

// Retry getting IAP price with multiple attempts
async function getIAPPriceWithRetry(maxAttempts: number = 5): Promise<{ price: string; currency: string; formattedPrice: string } | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Pricing] IAP price fetch attempt ${attempt}/${maxAttempts}`);
    
    const iapPrice = await getIAPPrice();
    if (iapPrice && iapPrice.price && parseFloat(iapPrice.price) > 0) {
      console.log('[Pricing] IAP price fetched successfully:', iapPrice);
      return iapPrice;
    }
    
    // Wait before retry (exponential backoff: 500ms, 1s, 2s, 4s, 8s)
    if (attempt < maxAttempts) {
      const delay = 500 * Math.pow(2, attempt - 1);
      console.log(`[Pricing] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}

// Calculate GHS price for Paystack based on IAP price
function calculateGHSPrice(price: string, currency: string): string {
  const numericPrice = parseFloat(price);
  
  if (currency === 'GHS') {
    return price;
  }
  
  // Approximate conversion rates to GHS
  const toGHSRates: Record<string, number> = {
    USD: 16,
    EUR: 17,
    GBP: 20,
    NGN: 0.01,
    ZAR: 0.85,
    KES: 0.12,
  };
  
  const rate = toGHSRates[currency] || 16;
  const ghsAmount = numericPrice * rate;
  
  // Round to nearest whole number for GHS
  return Math.round(ghsAmount).toString();
}

// Load pricing config - platform specific
async function loadPricingConfig(userId?: string): Promise<PricingConfig> {
  try {
    console.log('[Pricing] Loading pricing config for platform:', Capacitor.getPlatform());
    
    // WEB: Always use USD $1.99
    if (!isNativeApp()) {
      console.log('[Pricing] Web platform - using USD pricing');
      return { ...webPricing };
    }
    
    // ANDROID: Use Google Play Console pricing
    if (isAndroid()) {
      console.log('[Pricing] Android - fetching Google Play price');
      const googlePrice = await getIAPPriceWithRetry(5);
      
      if (googlePrice && googlePrice.formattedPrice) {
        const symbol = extractCurrencySymbol(googlePrice.formattedPrice) || currencySymbols[googlePrice.currency] || googlePrice.currency;
        const ghsPrice = calculateGHSPrice(googlePrice.price, googlePrice.currency);
        
        const config: PricingConfig = {
          price: googlePrice.price,
          monthlyPrice: googlePrice.price,
          currency: googlePrice.currency,
          currencySymbol: symbol,
          displayPrice: googlePrice.formattedPrice + '/month',
          ghsPrice,
          loading: false,
          source: 'iap',
        };
        
        console.log('[Pricing] Android Google Play config:', config);
        return config;
      }
      
      // Fallback for Android if IAP fails
      console.log('[Pricing] Android IAP failed, using USD fallback');
      return { ...webPricing };
    }
    
    // iOS: Use App Store pricing
    if (isIOS()) {
      console.log('[Pricing] iOS - fetching App Store price');
      const applePrice = await getIAPPriceWithRetry(5);
      
      if (applePrice && applePrice.formattedPrice) {
        const symbol = extractCurrencySymbol(applePrice.formattedPrice) || currencySymbols[applePrice.currency] || applePrice.currency;
        const ghsPrice = calculateGHSPrice(applePrice.price, applePrice.currency);
        
        const config: PricingConfig = {
          price: applePrice.price,
          monthlyPrice: applePrice.price,
          currency: applePrice.currency,
          currencySymbol: symbol,
          displayPrice: applePrice.formattedPrice + '/month',
          ghsPrice,
          loading: false,
          source: 'iap',
        };
        
        console.log('[Pricing] iOS App Store config:', config);
        return config;
      }
      
      // Fallback for iOS if IAP fails
      console.log('[Pricing] iOS IAP failed, using USD fallback');
      return { ...webPricing };
    }
    
    // Default fallback
    return { ...webPricing };
  } catch (error) {
    console.error('[Pricing] Error loading config:', error);
    return { ...webPricing };
  }
}

// Preload pricing in background (call on login)
export function preloadPricingConfig(userId?: string): void {
  if (cachedConfig || configPromise) return;
  
  console.log('[Pricing] Preloading pricing config in background');
  configPromise = loadPricingConfig(userId).then(config => {
    cachedConfig = config;
    configPromise = null;
    return config;
  });
}

// Hook to use pricing config
export function usePricingConfig(): PricingConfig {
  const [config, setConfig] = useState<PricingConfig>(
    cachedConfig || { ...webPricing, loading: true }
  );

  useEffect(() => {
    // If already cached, use it
    if (cachedConfig) {
      setConfig(cachedConfig);
      return;
    }

    // If loading in progress, wait for it
    if (configPromise) {
      configPromise.then(setConfig);
      return;
    }

    // Otherwise, load fresh
    const loadConfig = async () => {
      const freshConfig = await loadPricingConfig();
      cachedConfig = freshConfig;
      setConfig(freshConfig);
    };

    loadConfig();
  }, []);

  return config;
}

// Clear cache (useful for testing or when user changes country)
export function clearPricingCache(): void {
  cachedConfig = null;
  configPromise = null;
}
