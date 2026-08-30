import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getStripeSecretKey } from '../_shared/stripe-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Creates a Stripe Customer for the calling user (or reuses their existing
// advertiser_profiles.stripe_customer_id, e.g. if a prior attempt was
// abandoned before finishing) and a SetupIntent for that customer, so the
// frontend can collect and save a card via Stripe Elements without ever
// sending the raw card number/CVC through our own servers - only Stripe's
// client-side SDK ever sees it.
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

    const stripeSecretKey = await getStripeSecretKey();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    // Reuse an existing Stripe customer for this user if one was already
    // created (e.g. they started onboarding, closed the app, and are now
    // resuming) rather than creating a duplicate every time.
    const { data: existingProfile } = await supabase
      .from('advertiser_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    let customerId = existingProfile?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    return new Response(
      JSON.stringify({
        success: true,
        clientSecret: setupIntent.client_secret,
        customerId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('stripe-setup-intent error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
