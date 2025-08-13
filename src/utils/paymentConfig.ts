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
        const { data: planData, error: planError } = await supabase.functions.invoke('paystack-get-plan', {
          body: { planCode: data.paystack_plan_code }
        });
        
        if (!planError && planData?.success && planData?.plan?.amount) {
          // Convert from kobo to main currency unit
          monthlyPrice = (planData.plan.amount / 100).toString();
        }
      } catch (planError) {
        console.error('Error fetching plan price:', planError);
      }
    }
    
    return { 
      price: data.premium_price.toString(), 
      monthlyPrice,
      paymentMethods: validMethods,
      currency: data.currency,
      countryPrices: data.country_prices || {},
      paystackPlanCode: data.paystack_plan_code
    };
  } catch (error) {
    console.error('Error fetching payment config:', error);
    return { 
      price: '50', 
      monthlyPrice: null,
      paymentMethods: [],
      currency: 'GHS',
      countryPrices: {},
      paystackPlanCode: null
    };
  }
}
