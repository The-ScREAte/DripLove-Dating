// Supabase Edge Function: cancel-subscription
// Cancels a user's subscription (IAP, Paystack, etc.) and sets expires_at to the end of the current period.
// If Paystack, disables the subscription via Paystack API.
// Expects: { user_id: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { getPaystackSecretKey } from '../_shared/paystack-utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

async function disablePaystackSubscription(subscription_code: string, secretKey: string) {
  const resp = await fetch('https://api.paystack.co/subscription/disable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: subscription_code,
      token: 'unsubscribe',
    }),
  })
  return await resp.json()
}

async function deactivatePaystackAuthorization(authorization_code: string, secretKey: string) {
  const resp = await fetch('https://api.paystack.co/customer/deactivate_authorization', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ authorization_code }),
  })
  return await resp.json()
}

// Duplicate function removed - using the one defined above at line 41

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()
    if (!user_id) return json(400, { error: 'Missing user_id' })

    // Get the appropriate secret key based on mode in database
    const PAYSTACK_SECRET_KEY = await getPaystackSecretKey()

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    // Get active subscription from user_subscriptions
    const { data: sub, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .single()
    if (error || !sub) return json(404, { error: 'No active subscription found' })

    // If Paystack, deactivate authorization codes to prevent future charges
    if (sub.payment_method === 'paystack') {
      // Deactivate saved authorization codes (prevents recurring charges)
      const { data: authRows } = await supabase
        .from('paystack_authorizations')
        .select('authorization_code')
        .eq('user_id', user_id)
        .eq('status', 'active')

      if (authRows && authRows.length > 0) {
        for (const authRow of authRows) {
          try {
            await deactivatePaystackAuthorization(authRow.authorization_code, PAYSTACK_SECRET_KEY)
          } catch (err) {
            console.error('Failed to deactivate Paystack auth:', err)
            // Non-fatal: we still disable locally
          }
        }

        // Mark all authorizations as disabled in DB
        await supabase
          .from('paystack_authorizations')
          .update({ status: 'disabled', updated_at: new Date().toISOString() })
          .eq('user_id', user_id)
          .eq('status', 'active')
      }

      // Legacy: if subscription_code exists, try to disable it too
      if (sub.provider_transaction_id) {
        try {
          await disablePaystackSubscription(sub.provider_transaction_id, PAYSTACK_SECRET_KEY)
        } catch (err) {
          // Non-fatal
        }
      }
    }

    // Mark cancellation requested, keep status=active so user stays premium until expiry
    const { error: updateErr } = await supabase
      .from('user_subscriptions')
      .update({ 
        cancellation_requested: true,
        cancellation_requested_at: new Date().toISOString(),
        auto_renew: false,
        status: 'active',  // Keep active until expiry!
        updated_at: new Date().toISOString()
        // plan_name stays 'premium'
        // expires_at unchanged
      })
      .eq('id', sub.id)
    if (updateErr) return json(500, { error: updateErr.message })

    return json(200, { 
      message: 'Subscription canceled. You will remain premium until the end of your period.',
      expires_at: sub.expires_at
    })
  } catch (err: any) {
    return json(500, { error: err.message || 'Unknown error' })
  }
})
