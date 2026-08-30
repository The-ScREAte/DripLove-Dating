import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getStripeSecretKey } from '../_shared/stripe-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Advertisers must always have at least one card on file (so a live ad's
// billing never silently has nothing to charge), so this refuses to detach
// the last remaining payment method on the account.
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

    const { paymentMethodId } = await req.json();
    if (!paymentMethodId) throw new Error('paymentMethodId is required');

    const { data: profileRow, error: profileError } = await supabase
      .from('advertiser_profiles')
      .select('stripe_customer_id, stripe_payment_method_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profileRow?.stripe_customer_id) throw new Error('No advertiser account found');

    const stripeSecretKey = await getStripeSecretKey();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    const existing = await stripe.paymentMethods.list({ customer: profileRow.stripe_customer_id, type: 'card' });
    const target = existing.data.find((pm) => pm.id === paymentMethodId);
    if (!target) throw new Error('Payment method does not belong to this user');

    if (existing.data.length <= 1) {
      throw new Error('You must keep at least one card on file. Add another card before removing this one.');
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    // If the card just removed was the one we display as "the" card on the
    // advertiser's profile, fall back to whichever card is left.
    if (profileRow.stripe_payment_method_id === paymentMethodId) {
      const remaining = existing.data.find((pm) => pm.id !== paymentMethodId);
      if (remaining) {
        await supabase
          .from('advertiser_profiles')
          .update({
            stripe_payment_method_id: remaining.id,
            card_brand: remaining.card?.brand || null,
            card_last4: remaining.card?.last4 || null,
          })
          .eq('id', user.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('stripe-remove-payment-method error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
