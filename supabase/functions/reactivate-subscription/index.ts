// Supabase Edge Function: reactivate-subscription
// Reactivates a canceled Paystack subscription before expiry
// For iOS/Android, users must reactivate via their respective app stores

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()
    if (!user_id) return json(400, { error: 'Missing user_id' })

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    
    // Get subscription
    const { data: sub, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .single()
    
    if (error || !sub) {
      return json(404, { error: 'No active subscription found' })
    }

    if (!sub.cancellation_requested) {
      return json(400, { error: 'Subscription is not canceled' })
    }

    // Check if already expired
    if (sub.expires_at && new Date(sub.expires_at) <= new Date()) {
      return json(400, { error: 'Subscription has already expired. Please subscribe again.' })
    }

    // Only allow Paystack reactivation via API
    // iOS/Android users must reactivate via their app stores
    if (sub.payment_method !== 'paystack') {
      const storeName = sub.payment_method === 'google' ? 'Google Play Store' : 'App Store'
      return json(400, { 
        error: `Please reactivate your subscription in the ${storeName}`,
        payment_method: sub.payment_method
      })
    }

    // Get Paystack secret key
    const PAYSTACK_SECRET_KEY = await getPaystackSecretKey()

    // Re-enable Paystack authorization codes
    const { data: authRows } = await supabase
      .from('paystack_authorizations')
      .select('authorization_code')
      .eq('user_id', user_id)
      .eq('status', 'disabled')

    if (authRows && authRows.length > 0) {
      await supabase
        .from('paystack_authorizations')
        .update({ 
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user_id)
        .eq('status', 'disabled')
      
      console.log(`[REACTIVATE] Re-enabled ${authRows.length} authorization(s) for user ${user_id}`)
    }

    // Calculate if we should charge immediately or wait
    const expiresAt = new Date(sub.expires_at)
    const now = new Date()
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    // If less than 3 days until expiry, charge immediately and extend
    const shouldChargeNow = daysUntilExpiry <= 3

    if (shouldChargeNow) {
      console.log(`[REACTIVATE] Only ${daysUntilExpiry} days until expiry, will charge immediately`)
      // The next recurring billing run will pick this up and charge
      // Set next_billing_date to now so it gets processed
      await supabase
        .from('user_subscriptions')
        .update({
          cancellation_requested: false,
          cancellation_requested_at: null,
          auto_renew: true,
          next_billing_date: new Date().toISOString(), // Charge on next run
          updated_at: new Date().toISOString()
        })
        .eq('id', sub.id)
      
      return json(200, { 
        message: 'Subscription reactivated! You will be charged within the hour to extend your subscription.',
        charge_timing: 'immediate'
      })
    } else {
      console.log(`[REACTIVATE] ${daysUntilExpiry} days until expiry, will charge on renewal date`)
      // Reactivate but keep original expiry date
      await supabase
        .from('user_subscriptions')
        .update({
          cancellation_requested: false,
          cancellation_requested_at: null,
          auto_renew: true,
          // next_billing_date stays the same
          updated_at: new Date().toISOString()
        })
        .eq('id', sub.id)
      
      return json(200, { 
        message: `Subscription reactivated! You will be charged on ${expiresAt.toLocaleDateString()} to continue your premium access.`,
        charge_timing: 'on_renewal_date',
        next_billing_date: sub.expires_at
      })
    }

  } catch (err: any) {
    console.error('[REACTIVATE] Error:', err)
    return json(500, { error: err.message || 'Unknown error' })
  }
})
