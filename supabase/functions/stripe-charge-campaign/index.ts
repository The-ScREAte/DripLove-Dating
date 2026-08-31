import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getStripeSecretKey } from '../_shared/stripe-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Charges an advertiser's card on file for a campaign's FULL budget upfront,
// the moment they hit "Launch Campaign" - not metered daily. The amount is
// recomputed server-side from budgetPerDay x durationDays (never trusting a
// client-supplied total) so it can't be tampered with in the request.
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

    const { budgetPerDay, durationDays } = await req.json();
    if (!budgetPerDay || budgetPerDay <= 0) throw new Error('budgetPerDay must be greater than 0');
    if (!durationDays || durationDays <= 0) throw new Error('durationDays must be greater than 0');

    const { data: advertiser, error: advertiserError } = await supabase
      .from('advertiser_profiles')
      .select('status, stripe_customer_id, stripe_payment_method_id')
      .eq('id', user.id)
      .maybeSingle();
    if (advertiserError) throw advertiserError;
    if (!advertiser || advertiser.status !== 'approved') {
      throw new Error('Your advertiser account must be approved before launching a campaign');
    }
    if (!advertiser.stripe_customer_id || !advertiser.stripe_payment_method_id) {
      throw new Error('No card on file - add a payment method before launching a campaign');
    }

    const totalBudget = Math.round(budgetPerDay * durationDays * 100) / 100;
    const amountCents = Math.round(totalBudget * 100);

    const stripeSecretKey = await getStripeSecretKey();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: advertiser.stripe_customer_id,
        payment_method: advertiser.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `DripLove ad campaign: $${budgetPerDay}/day x ${durationDays} days`,
      });
    } catch (stripeError) {
      const message = stripeError instanceof Error ? stripeError.message : 'Payment failed';
      throw new Error(`Payment failed: ${message}`);
    }

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment did not complete (status: ${paymentIntent.status}). Please try a different card.`);
    }

    return new Response(
      JSON.stringify({ success: true, paymentIntentId: paymentIntent.id, totalBudget }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('stripe-charge-campaign error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
