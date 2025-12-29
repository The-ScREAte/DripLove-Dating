// Supabase Edge Function: cancel-subscription
// Cancels a user's subscription (IAP, Paystack, etc.) and sets expires_at to the end of the current period.
// If Paystack, disables the subscription via Paystack API.
// Expects: { user_id: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
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

async function disablePaystackSubscription(subscription_code: string) {
  const resp = await fetch('https://api.paystack.co/subscription/disable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: subscription_code,
      token: 'unsubscribe',
    }),
  })
  return await resp.json()
}

async function deactivatePaystackAuthorization(authorization_code: string) {
  const resp = await fetch('https://api.paystack.co/customer/deactivate_authorization', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ authorization_code }),
  })
  return await resp.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()
    if (!user_id) return json(400, { error: 'Missing user_id' })

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    // Get active subscription from user_subscriptions
    const { data: sub, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .single()
    if (error || !sub) return json(404, { error: 'No active subscription found' })

    // If Paystack, disable at provider
    if (sub.payment_method === 'paystack') {
      // New model (no plan codes): deactivate saved authorization codes (prevents future charges).
      const { data: authRow } = await supabase
        .from('paystack_authorizations')
        .select('authorization_code')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (authRow?.authorization_code) {
        try {
          await deactivatePaystackAuthorization(authRow.authorization_code)
        } catch {
          // Non-fatal: we still cancel locally.
        }

        await supabase
          .from('paystack_authorizations')
          .update({ status: 'disabled', updated_at: new Date().toISOString() })
          .eq('user_id', user_id)
          .eq('status', 'active')
      }

      // Legacy model (plan-code subscription): still attempt provider disable if we have a subscription_code.
      // NOTE: In the new flow flutterwave_transaction_id may be a reference; this call will simply fail silently.
      if (sub.flutterwave_transaction_id) {
        try {
          await disablePaystackSubscription(sub.flutterwave_transaction_id)
        } catch {
          // Non-fatal
        }
      }
    }
    // If IAP, no external API call needed
    if (sub.payment_method === 'iap') {
      // Optionally: notify your app server, log, or trigger a webhook
    }

    // Mark as cancelled, keep expires_at as is
    const { error: updateErr } = await supabase
      .from('user_subscriptions')
      .update({ status: 'cancelled', auto_renew: false, updated_at: new Date().toISOString() })
      .eq('id', sub.id)
    if (updateErr) return json(500, { error: updateErr.message })

    return json(200, { message: 'Subscription canceled. You will remain premium until the end of your period.' })
  } catch (err: any) {
    return json(500, { error: err.message || 'Unknown error' })
  }
})
