// Supabase Edge Function: deactivate-user-payments
// Called before account deletion to deactivate all payment methods (Paystack authorizations).
// This ensures no future charges can occur after the user deletes their account.
// Expects: { user_id: string }

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
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

async function deactivatePaystackAuthorization(authorization_code: string) {
  try {
    const resp = await fetch('https://api.paystack.co/customer/deactivate_authorization', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ authorization_code }),
    })
    return await resp.json()
  } catch (err) {
    console.error('Paystack deactivate error:', err)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()
    if (!user_id) return json(400, { error: 'Missing user_id' })

    if (!PAYSTACK_SECRET_KEY) {
      console.warn('[DEACTIVATE-PAYMENTS] PAYSTACK_SECRET_KEY not set, skipping Paystack calls')
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Get all active Paystack authorizations for this user
    const { data: authRows } = await supabase
      .from('paystack_authorizations')
      .select('id, authorization_code')
      .eq('user_id', user_id)
      .eq('status', 'active')

    if (!authRows || authRows.length === 0) {
      console.log(`[DEACTIVATE-PAYMENTS] No active Paystack authorizations for user ${user_id}`)
      return json(200, { message: 'No payment methods to deactivate' })
    }

    console.log(`[DEACTIVATE-PAYMENTS] Deactivating ${authRows.length} Paystack authorization(s) for user ${user_id}`)

    let deactivated = 0
    let failed = 0

    // Deactivate each authorization at Paystack provider
    if (PAYSTACK_SECRET_KEY) {
      for (const authRow of authRows) {
        const result = await deactivatePaystackAuthorization(authRow.authorization_code)
        if (result) {
          deactivated++
        } else {
          failed++
        }
      }
    }

    // Mark all as disabled in DB (even if Paystack call fails, we disable locally)
    const { error: updateErr } = await supabase
      .from('paystack_authorizations')
      .update({ 
        status: 'disabled',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user_id)
      .eq('status', 'active')

    if (updateErr) {
      console.error('[DEACTIVATE-PAYMENTS] Failed to update DB:', updateErr)
      return json(500, { error: 'Failed to disable payment methods in DB' })
    }

    // Also disable auto_renew on any active subscriptions (safety)
    await supabase
      .from('user_subscriptions')
      .update({ 
        auto_renew: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user_id)
      .eq('auto_renew', true)

    console.log(`[DEACTIVATE-PAYMENTS] Successfully deactivated payment methods for user ${user_id}`)
    
    return json(200, { 
      message: 'Payment methods deactivated',
      deactivated,
      failed,
      total: authRows.length
    })
  } catch (err: unknown) {
    console.error('[DEACTIVATE-PAYMENTS] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json(500, { error: message })
  }
})
