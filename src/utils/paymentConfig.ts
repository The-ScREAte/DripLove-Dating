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
    console.error('Error fetching payment config:', error);
    return null;
  }
}

export async function getPremiumPaymentConfig() {
  try {
    const { data, error } = await supabase
      .from('payment_config')
      .select('premium_price, currency, payment_methods, country_prices, paystack_plan_code')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    // Only return payment methods that have required details filled
    const validMethods = (data.payment_methods as any[]).filter((m: any) => 
      m.details && (m.type !== 'momo' || m.name)
    );

    // Fetch monthly plan price from Paystack if plan code exists
    let monthlyPrice = null;
    if (data.paystack_plan_code) {
      try {
        const response = await fetch(`/api/functions/v1/paystack-init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'get_plan',
            plan_code: data.paystack_plan_code
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            monthlyPrice = (result.data.amount / 100).toString(); // Convert from kobo to main currency
          }
        }
      } catch (planError) {
        console.log('Could not fetch plan price:', planError);
      }
    }
    
    return { 
      price: data.premium_price.toString(), 
      monthlyPrice,
      paymentMethods: validMethods,
      currency: data.currency,
      countryPrices: data.country_prices || {}
    };
  } catch (error) {
    console.error('Error fetching payment config:', error);
    return { 
      price: '50', 
      monthlyPrice: null,
      paymentMethods: [],
      currency: 'GHS',
      countryPrices: {}
    };
  }
}
