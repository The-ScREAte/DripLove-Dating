import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getStripeSecretKey } from '../_shared/stripe-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// After the client confirms the SetupIntent with Stripe.js (card number/CVC
// never leave the client, let alone reach here), Stripe only hands back a
// bare payment_method ID. This looks that ID up server-side to get the
// brand/last4 for display and for the row we save - card detail lookups
// stay server-side rather than trusting anything the client claims about
// its own card.
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

    const stripeSecretKey = await getStripeSecretKey();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Make sure this payment method actually belongs to the calling user's
    // own Stripe customer - never trust a client-supplied ID blindly.
    const { data: profileRow } = await supabase
      .from('advertiser_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileRow?.stripe_customer_id && paymentMethod.customer !== profileRow.stripe_customer_id) {
      throw new Error('Payment method does not belong to this user');
    }

    // The most recently added card becomes the one actually billed.
    if (paymentMethod.customer) {
      await stripe.customers.update(paymentMethod.customer as string, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    // Onboarding creates the advertiser_profiles row itself right after this
    // call returns, so there's nothing to update yet in that case - this only
    // actually writes anything when a signed-up advertiser is adding another
    // card to an account that already exists.
    if (profileRow) {
      await supabase
        .from('advertiser_profiles')
        .update({
          stripe_payment_method_id: paymentMethodId,
          card_brand: paymentMethod.card?.brand || null,
          card_last4: paymentMethod.card?.last4 || null,
        })
        .eq('id', user.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        brand: paymentMethod.card?.brand || null,
        last4: paymentMethod.card?.last4 || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('stripe-confirm-card-setup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
