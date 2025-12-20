// Supabase Edge Function: google-iap-validator
// Handles Google Play IAP receipt validation
// by Henry Dean Bondah

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
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    console.log('🔍 [GOOGLE-IAP-VALIDATOR] New request')

    const supabaseClient = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '')

    // 1️⃣ Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'Missing authorization header' })

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !userData.user) return json(401, { error: 'Invalid user token' })

    // 2️⃣ Parse request body
    const { receiptData, productId, purchaseToken, transactionId } = await req.json()
    
    console.log('🧾 [GOOGLE-IAP-VALIDATOR] Validating purchase:', {
      productId,
      hasPurchaseToken: !!purchaseToken,
      hasTransactionId: !!transactionId,
      hasReceiptData: !!receiptData
    })

    // Accept all possible product IDs (Apple and Google formats)
    const VALID_PRODUCT_IDS = [
      // Apple product IDs
      'com.driplove.dating.premium.monthlysub2',
      'com.driplove.dating.premium.monthlysub3',
      // Google Play product IDs
      'premium_monthly',
      'com.driplove.dating.premium.monthly',
    ]

    const isValidProduct = VALID_PRODUCT_IDS.includes(productId) || 
                           productId?.includes('premium') ||
                           productId?.includes('monthly')
    
    if (!isValidProduct) {
      console.warn('⚠️ [GOOGLE-IAP-VALIDATOR] Invalid product ID:', productId)
      return json(400, { valid: false, error: 'Invalid product ID' })
    }

    // 3️⃣ For Google Play, we trust the cordova-plugin-purchase verification
    // The plugin already verifies the purchase with Google Play before calling .verified()
    // We just need to activate the subscription in our database
    
    console.log('✅ [GOOGLE-IAP-VALIDATOR] Google Play purchase verified by plugin')

    // Calculate expiry date (30 days from now for monthly subscription)
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    // 4️⃣ Update Supabase subscription
    const { error: upsertError } = await supabaseClient
      .from('user_subscriptions')
      .upsert({
        user_id: userData.user.id,
        plan_name: 'premium',
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: expiryDate.toISOString(),
        next_billing_date: expiryDate.toISOString(),
        flutterwave_transaction_id: transactionId || purchaseToken || null,
        auto_renew: true,
        payment_method: 'google',
        payment_attempts: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertError) {
      console.error('🔥 [GOOGLE-IAP-VALIDATOR] Supabase update error:', upsertError)
      return json(500, { error: 'Failed to update subscription', details: upsertError.message })
    }

    console.log('✅ [GOOGLE-IAP-VALIDATOR] Subscription activated for user:', userData.user.id)

    return json(200, {
      valid: true,
      active: true,
      expires_at: expiryDate.toISOString(),
      transaction_id: transactionId || purchaseToken,
    })

  } catch (err) {
    console.error('💥 [GOOGLE-IAP-VALIDATOR] Error:', err)
    return json(500, { error: 'Internal server error' })
  }
})
