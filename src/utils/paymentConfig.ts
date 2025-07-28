import { supabase } from '@/integrations/supabase/client';


export async function getPaymentConfig() {
  try {
    const { data, error } = await supabase
      .from('payment_config')
      .select('*, enabled_countries')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching payment config:', error);
    return null;
  }
}

// Helper to get enabled countries as array of codes
export async function getEnabledCountries(): Promise<string[]> {
  const config = await getPaymentConfig();
  if (config && Array.isArray(config.enabled_countries)) {
    return config.enabled_countries;
  }
  return [];
}

export async function getPremiumPaymentConfig() {
  try {
    const { data, error } = await supabase
      .from('payment_config')
      .select('premium_price, currency, payment_methods, country_prices')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    // Only return payment methods that have required details filled
    const validMethods = (data.payment_methods as any[]).filter((m: any) => 
      m.details && (m.type !== 'momo' || m.name)
    );
    
    return { 
      price: data.premium_price.toString(), 
      paymentMethods: validMethods,
      currency: data.currency,
      countryPrices: data.country_prices || {}
    };
  } catch (error) {
    console.error('Error fetching payment config:', error);
    return { 
      price: '50', 
      paymentMethods: [],
      currency: 'GHS',
      countryPrices: {}
    };
  }
}
