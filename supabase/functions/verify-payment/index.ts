import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get the session or user object
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { transaction_id, tx_ref } = await req.json()

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: 'Transaction ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Verifying payment for user:', user.id, 'transaction:', transaction_id, 'tx_ref:', tx_ref)

    // Verify payment with Flutterwave
    const flwSecretKey = Deno.env.get('FLW_SECRET_KEY')
    if (!flwSecretKey) {
      throw new Error('Flutterwave secret key not configured')
    }

    const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: {
        'Authorization': `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json',
      },
    })

    const flwData = await flwRes.json()
    console.log('Flutterwave API response status:', flwRes.status)
    console.log('Flutterwave response data:', flwData)

    if (!flwRes.ok) {
      console.error('Flutterwave API error:', flwRes.status, flwData)
      return new Response(
        JSON.stringify({ 
          error: 'Flutterwave API error', 
          details: flwData,
          status: flwRes.status
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (flwData.status !== 'success' || flwData.data.status !== 'successful') {
      console.error('Payment verification failed:', flwData)
      return new Response(
        JSON.stringify({ error: 'Payment verification failed', details: flwData }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const transactionData = flwData.data
    const paymentType = transactionData.payment_type
    const amount = transactionData.amount
    const currency = transactionData.currency

    // Extract tokens for recurring billing
    let flwToken = null
    if (paymentType === 'card' && transactionData.card?.token) {
      flwToken = transactionData.card.token
    } else if (paymentType === 'mobilemoneyghana' && transactionData.meta?.authorization?.token) {
      flwToken = transactionData.meta.authorization.token
    }

    // Create subscription record
    const subscriptionData: any = {
      user_id: user.id,
      plan_name: 'premium',
      status: 'active',
      flutterwave_transaction_id: transaction_id,
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      updated_at: new Date().toISOString(),
    }

    // Add token for recurring billing if available (only if columns exist)
    if (flwToken) {
      try {
        if (paymentType === 'card') {
          subscriptionData.flw_card_token = flwToken
        } else if (paymentType === 'mobilemoneyghana') {
          subscriptionData.flw_momo_token = flwToken
        }
      } catch (error) {
        console.log('Token columns might not exist, skipping token storage')
      }
    }

    // Upsert subscription
    const { data: subscription, error: subscriptionError } = await supabaseClient
      .from('user_subscriptions')
      .upsert(subscriptionData, { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      })
      .select()

    if (subscriptionError) {
      console.error('Subscription error:', subscriptionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create subscription', details: subscriptionError }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Subscription created successfully:', subscription)

    return new Response(
      JSON.stringify({ 
        success: true, 
        subscription: subscription[0],
        payment_details: {
          transaction_id,
          amount,
          currency,
          payment_type: paymentType
        }
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Verify payment error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
