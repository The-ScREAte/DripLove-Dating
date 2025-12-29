import { supabase } from '@/integrations/supabase/client';

export async function getPaymentConfig() {
  try {
    const { data, error } = await supabase
      .from('payment_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    return null;
  }
}

export async function getPremiumPaymentConfig() {
  try {
    const response = await supabase
      .from('payment_config')
      .select('payment_methods, default_international_price, default_international_currency')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (response.error) throw response.error;

    const data = response.data as any; // Use any to bypass TypeScript issues

    // Only return payment methods that have required details filled
    const validMethods = (data.payment_methods as any[]).filter((m: any) => 
      m.details && (m.type !== 'momo' || m.name)
    );

    // Use default international price for both one-time and monthly
    const price = data.default_international_price?.toString() || '5';
    const currency = data.default_international_currency || 'USD';
    
    return { 
      price,
      monthlyPrice: price,
      paymentMethods: validMethods,
      currency,
      defaultInternationalPrice: price,
      defaultInternationalCurrency: currency
    };
  } catch (error) {
    return { 
      price: '5',
      monthlyPrice: '5',
      paymentMethods: [],
      currency: 'USD',
      defaultInternationalPrice: '5',
      defaultInternationalCurrency: 'USD'
    };
  }
}
