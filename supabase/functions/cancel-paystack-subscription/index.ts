// Supabase Edge Function: cancel-paystack-subscription
// This function disables the user's Paystack subscription using the Paystack API
// and updates the user's subscription status in the database.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get the current user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders });
    }

    // Get the user's subscription record (must store paystack_subscription_code in your DB)
    const { data: subscription, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('paystack_subscription_code')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subError || !subscription?.paystack_subscription_code) {
      return new Response(JSON.stringify({ error: 'No active Paystack subscription found.' }), { status: 400, headers: corsHeaders });
    }

    // Call Paystack API to disable the subscription
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    const paystackSubCode = subscription.paystack_subscription_code;
    const paystackRes = await fetch(`https://api.paystack.co/subscription/${paystackSubCode}/disable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
    });
    const paystackData = await paystackRes.json();
    if (!paystackRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to cancel on Paystack', details: paystackData }), { status: 500, headers: corsHeaders });
    }

    // Update the subscription status in your DB
    const { error: updateError } = await supabaseClient
      .from('user_subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update subscription in DB', details: updateError }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
