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
      .select('premium_price, premium_price_monthly, currency, payment_methods, country_prices, paystack_plan_code, default_international_price, default_international_currency')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (response.error) throw response.error;

    const data = response.data as any; // Use any to bypass TypeScript issues

    // Only return payment methods that have required details filled
    const validMethods = (data.payment_methods as any[]).filter((m: any) => 
      m.details && (m.type !== 'momo' || m.name)
    );

    // Use the monthly price from database, or fall back to Paystack if needed
    let monthlyPrice = data.premium_price_monthly?.toString() || null;
    
    // If no monthly price in DB but we have a Paystack plan, try to fetch it
    if (!monthlyPrice && data.paystack_plan_code) {
      try {
        const paystackResponse = await fetch(`/api/functions/v1/paystack-init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'get_plan',
            plan_code: data.paystack_plan_code
          })
        });
        
        if (paystackResponse.ok) {
          const result = await paystackResponse.json();
          if (result.success && result.data) {
            monthlyPrice = (result.data.amount / 100).toString(); // Convert from kobo to main currency
          }
        }
      } catch (planError) {
        // Silent error handling
      }
    }
    
    return { 
      price: data.premium_price?.toString() || '50', 
      monthlyPrice,
      paymentMethods: validMethods,
      currency: data.currency || 'GHS',
      countryPrices: data.country_prices || {},
      defaultInternationalPrice: data.default_international_price?.toString() || '5',
      defaultInternationalCurrency: data.default_international_currency || 'USD'
    };
  } catch (error) {
    return { 
      price: '50', 
      monthlyPrice: null,
      paymentMethods: [],
      currency: 'GHS',
      countryPrices: {},
      defaultInternationalPrice: '5',
      defaultInternationalCurrency: 'USD'
    };
  }
}
