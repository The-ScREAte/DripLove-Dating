// Supabase Edge Function: subscription-checker
// Periodically checks and updates subscription statuses, handles expiry and failures
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
    console.log('[SUBSCRIPTION-CHECKER] Starting subscription status check')
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Run the subscription expiry handler
    const { error: expiryError } = await supabase.rpc('handle_subscription_expiry')
    
    if (expiryError) {
      console.error('[SUBSCRIPTION-CHECKER] Error handling subscription expiry:', expiryError)
      return json(500, { error: 'Failed to handle subscription expiry' })
    }

    // Get stats of what was updated
    const { data: expiredSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, plan_name, expires_at')
      .in('status', ['expired', 'payment_failed'])
      .gte('updated_at', new Date(Date.now() - 60000).toISOString()) // Last minute
    
    const expiredCount = expiredSubscriptions?.length || 0
    
    console.log(`[SUBSCRIPTION-CHECKER] Processed ${expiredCount} expired/failed subscriptions`)

    // Optional: Check for subscriptions that are about to expire (within 24 hours)
    const { data: soonToExpire } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, expires_at')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .lte('expires_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .gte('expires_at', new Date().toISOString())

    const soonToExpireCount = soonToExpire?.length || 0
    
    console.log(`[SUBSCRIPTION-CHECKER] Found ${soonToExpireCount} subscriptions expiring within 24 hours`)
    
    return json(200, {
      message: 'Subscription check completed',
      processed: expiredCount,
      expiring_soon: soonToExpireCount,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[SUBSCRIPTION-CHECKER] Error:', error)
    return json(500, { error: 'Internal server error' })
  }
})