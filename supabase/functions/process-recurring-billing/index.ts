import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Starting recurring billing process...')

    // Get all subscriptions that need to be billed today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: subscriptions, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('*')
      .eq('status', 'active')
      .eq('auto_renew', true)
      .gte('next_billing_date', today.toISOString())
      .lt('next_billing_date', tomorrow.toISOString())

    if (subError) {
      console.error('Error fetching subscriptions:', subError)
      throw subError
    }

    console.log(`Found ${subscriptions?.length || 0} subscriptions to process`)

    const results = []
    const flwSecretKey = Deno.env.get('FLW_SECRET_KEY')

    if (!flwSecretKey) {
      throw new Error('FLW_SECRET_KEY not configured')
    }

    for (const subscription of subscriptions || []) {
      try {
        let chargeResult = null
        const amount = 50 // Premium price - could be dynamic from payment_config table

        // Determine which token to use for recurring billing
        if (subscription.flw_card_token) {
          // Charge using card token
          const cardChargePayload = {
            token: subscription.flw_card_token,
            currency: 'GHS',
            amount: amount,
            email: subscription.user_id, // Would need to get actual email from profiles
            tx_ref: `recurring_${subscription.user_id}_${Date.now()}`,
            narration: 'DripLove Premium Monthly Subscription'
          }

          const cardResponse = await fetch('https://api.flutterwave.com/v3/tokenized-charges', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${flwSecretKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(cardChargePayload),
          })

          chargeResult = await cardResponse.json()
        } else if (subscription.flw_momo_token) {
          // For MoMo, we would need to implement the MoMo recurring charge
          // This is more complex and may require different approach
          console.log('MoMo recurring billing not implemented yet')
          continue
        }

        if (chargeResult?.status === 'success') {
          // Successful charge - extend subscription
          const nextBillingDate = new Date()
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)

          await supabaseClient
            .from('user_subscriptions')
            .update({
              next_billing_date: nextBillingDate.toISOString(),
              expires_at: nextBillingDate.toISOString(),
              flutterwave_transaction_id: chargeResult.data.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', subscription.id)

          console.log(`Successfully charged user ${subscription.user_id}`)
          results.push({ user_id: subscription.user_id, status: 'success' })
        } else {
          // Failed charge - mark subscription as failed/expired
          await supabaseClient
            .from('user_subscriptions')
            .update({
              status: 'expired',
              auto_renew: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', subscription.id)

          console.log(`Failed to charge user ${subscription.user_id}`)
          results.push({ user_id: subscription.user_id, status: 'failed', error: chargeResult?.message })
        }
      } catch (error) {
        console.error(`Error processing subscription for user ${subscription.user_id}:`, error)
        results.push({ user_id: subscription.user_id, status: 'error', error: error.message })
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error in recurring billing:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})