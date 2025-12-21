// Supabase Edge Function: subscription-checker
// Periodically checks and updates subscription statuses, handles expiry and failures
// Runs hourly via cron job
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

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
    console.log('[SUBSCRIPTION-CHECKER] Starting subscription status check at', new Date().toISOString())
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    
    // Step 1: Get count of subscriptions that need processing BEFORE running the handler
    const { data: beforeCheck } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, plan_name, expires_at, auto_renew, payment_method')
      .eq('status', 'active')
      .eq('plan_name', 'premium')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
    
    const needsProcessingCount = beforeCheck?.length || 0
    console.log(`[SUBSCRIPTION-CHECKER] Found ${needsProcessingCount} expired subscriptions that need processing`)
    
    if (beforeCheck && beforeCheck.length > 0) {
      console.log('[SUBSCRIPTION-CHECKER] Subscriptions to process:', beforeCheck.map(s => ({
        user_id: s.user_id,
        plan_name: s.plan_name,
        status: s.status,
        expires_at: s.expires_at,
        auto_renew: s.auto_renew,
        payment_method: s.payment_method
      })))
    }
    
    // Step 2: Run the subscription expiry handler
    const { error: expiryError } = await supabase.rpc('handle_subscription_expiry')
    
    if (expiryError) {
      console.error('[SUBSCRIPTION-CHECKER] Error handling subscription expiry:', expiryError)
      return json(500, { error: 'Failed to handle subscription expiry', details: expiryError.message })
    }
    
    console.log('[SUBSCRIPTION-CHECKER] handle_subscription_expiry RPC completed successfully')

    // Step 3: Get stats of what was updated (look at last 5 minutes to catch all updates)
    const { data: expiredSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, plan_name, expires_at, payment_method')
      .in('status', ['expired', 'payment_failed'])
      .gte('updated_at', new Date(Date.now() - 5 * 60000).toISOString())
    
    const expiredCount = expiredSubscriptions?.length || 0
    
    console.log(`[SUBSCRIPTION-CHECKER] Processed ${expiredCount} expired/failed subscriptions in last 5 min`)
    
    if (expiredSubscriptions && expiredSubscriptions.length > 0) {
      console.log('[SUBSCRIPTION-CHECKER] Recently expired/failed:', expiredSubscriptions.map(s => ({
        user_id: s.user_id,
        status: s.status,
        payment_method: s.payment_method
      })))
    }

    // Step 4: Check for subscriptions expiring within 24 hours (for potential notifications)
    const { data: soonToExpire } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, expires_at, payment_method, auto_renew')
      .eq('status', 'active')
      .eq('plan_name', 'premium')
      .not('expires_at', 'is', null)
      .lte('expires_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .gte('expires_at', new Date().toISOString())

    const soonToExpireCount = soonToExpire?.length || 0
    
    console.log(`[SUBSCRIPTION-CHECKER] Found ${soonToExpireCount} subscriptions expiring within 24 hours`)
    
    // Step 5: Also check for "stuck" subscriptions - premium status but already expired
    // This catches any that weren't properly processed by the RPC
    const { data: stuckSubscriptions, error: stuckError } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, plan_name, expires_at, payment_method, auto_renew')
      .eq('status', 'active')
      .eq('plan_name', 'premium')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
    
    if (stuckSubscriptions && stuckSubscriptions.length > 0) {
      console.warn(`[SUBSCRIPTION-CHECKER] WARNING: Found ${stuckSubscriptions.length} stuck subscriptions that should have expired!`)
      console.log('[SUBSCRIPTION-CHECKER] Stuck subscriptions:', stuckSubscriptions)
      
      // Force update these manually
      for (const sub of stuckSubscriptions) {
        const newStatus = sub.auto_renew ? 'payment_failed' : 'expired'
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: newStatus,
            plan_name: 'free',
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id)
        
        if (updateError) {
          console.error(`[SUBSCRIPTION-CHECKER] Failed to fix stuck subscription ${sub.id}:`, updateError)
        } else {
          console.log(`[SUBSCRIPTION-CHECKER] Fixed stuck subscription ${sub.id} -> ${newStatus}`)
        }
      }
    }
    
    return json(200, {
      message: 'Subscription check completed',
      found_expired: needsProcessingCount,
      processed: expiredCount,
      expiring_soon: soonToExpireCount,
      stuck_fixed: stuckSubscriptions?.length || 0,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[SUBSCRIPTION-CHECKER] Error:', error)
    return json(500, { error: 'Internal server error', details: String(error) })
  }
})