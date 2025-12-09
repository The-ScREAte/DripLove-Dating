import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PricingConfig {
  price: string;
  monthlyPrice: string;
  currency: string;
  currencySymbol: string;
  displayPrice: string;
  ghsPrice: string;
  loading: boolean;
}

// Cache for pricing config
let cachedConfig: PricingConfig | null = null;
let configPromise: Promise<PricingConfig> | null = null;

// Currency symbols map
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

// Country to currency mapping
const countryCurrencyMap: Record<string, { currency: string; price: string }> = {
  US: { currency: 'USD', price: '1.99' },
  GH: { currency: 'GHS', price: '32' },
  NG: { currency: 'NGN', price: '3200' },
  GB: { currency: 'GBP', price: '1.59' },
  CA: { currency: 'CAD', price: '2.79' },
  AU: { currency: 'AUD', price: '2.99' },
  ZA: { currency: 'ZAR', price: '39' },
  KE: { currency: 'KES', price: '280' },
  TZ: { currency: 'TZS', price: '5200' },
  UG: { currency: 'UGX', price: '7500' },
  RW: { currency: 'RWF', price: '2800' },
  SN: { currency: 'XOF', price: '1200' },
  CI: { currency: 'XOF', price: '1200' },
  CM: { currency: 'XAF', price: '1200' },
  EG: { currency: 'EGP', price: '99' },
  MA: { currency: 'MAD', price: '20' },
  IN: { currency: 'INR', price: '169' },
  DE: { currency: 'EUR', price: '1.79' },
  FR: { currency: 'EUR', price: '1.79' },
  IT: { currency: 'EUR', price: '1.79' },
  ES: { currency: 'EUR', price: '1.79' },
  NL: { currency: 'EUR', price: '1.79' },
  BE: { currency: 'EUR', price: '1.79' },
  AT: { currency: 'EUR', price: '1.79' },
  IE: { currency: 'EUR', price: '1.79' },
  PT: { currency: 'EUR', price: '1.79' },
};

// Default pricing
const defaultPricing: PricingConfig = {
  price: '1.99',
  monthlyPrice: '1.99',
  currency: 'USD',
  currencySymbol: '$',
  displayPrice: '$1.99',
  ghsPrice: '32',
  loading: false,
};

// Detect user's country from profile or IP
async function detectUserCountry(userId?: string): Promise<string> {
  // First try to get from user profile
  if (userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('id', userId)
        .single();
      
      if (data?.country_code) {
        return data.country_code.toUpperCase();
      }
    } catch (e) {
      console.log('[Pricing] Could not fetch user country from profile');
    }
  }

  // Fallback to IP geolocation
  try {
    const response = await fetch('https://ipapi.co/json/', { 
      signal: AbortSignal.timeout(3000) 
    });
    if (response.ok) {
      const data = await response.json();
      if (data.country_code) {
        return data.country_code.toUpperCase();
      }
    }
  } catch (e) {
    console.log('[Pricing] IP geolocation failed, using default');
  }

  return 'US'; // Default to US
}

// Load pricing config
async function loadPricingConfig(userId?: string): Promise<PricingConfig> {
  try {
    // Detect country
    const countryCode = await detectUserCountry(userId);
    console.log('[Pricing] Detected country:', countryCode);

    // Get pricing for country
    const countryPricing = countryCurrencyMap[countryCode] || countryCurrencyMap.US;
    const currency = countryPricing.currency;
    const price = countryPricing.price;
    const currencySymbol = currencySymbols[currency] || currency;

    // Calculate GHS price for Paystack (always needed)
    // Use direct GHS price if in Ghana, otherwise convert
    let ghsPrice = '32';
    if (countryCode === 'GH') {
      ghsPrice = price;
    } else if (currency === 'USD') {
      // USD to GHS rate
      ghsPrice = (parseFloat(price) * 16).toFixed(0);
    } else {
      // For other currencies, use a fixed GHS amount
      ghsPrice = '32';
    }

    const config: PricingConfig = {
      price,
      monthlyPrice: price,
      currency,
      currencySymbol,
      displayPrice: `${currencySymbol}${price}`,
      ghsPrice,
      loading: false,
    };

    console.log('[Pricing] Loaded config:', config);
    return config;
  } catch (error) {
    console.error('[Pricing] Error loading config:', error);
    return defaultPricing;
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
    cachedConfig || { ...defaultPricing, loading: true }
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
      const { data: { user } } = await supabase.auth.getUser();
      const freshConfig = await loadPricingConfig(user?.id);
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
