import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getStripeSecretKey } from '../_shared/stripe-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error('Unauthorized');

    const { data: profileRow, error: profileError } = await supabase
      .from('advertiser_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profileRow?.stripe_customer_id) {
      return new Response(JSON.stringify({ success: true, cards: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const stripeSecretKey = await getStripeSecretKey();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    const [paymentMethods, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: profileRow.stripe_customer_id, type: 'card' }),
      stripe.customers.retrieve(profileRow.stripe_customer_id),
    ]);

    const defaultId = !('deleted' in customer)
      ? (customer.invoice_settings?.default_payment_method as string | null) || null
      : null;

    const cards = paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || 'card',
      last4: pm.card?.last4 || '----',
      expMonth: pm.card?.exp_month || null,
      expYear: pm.card?.exp_year || null,
      isDefault: pm.id === defaultId,
    }));

    return new Response(JSON.stringify({ success: true, cards }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('stripe-list-payment-methods error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
