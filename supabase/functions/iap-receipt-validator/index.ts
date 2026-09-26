// Supabase Edge Function: iap-receipt-validator
// Handles Apple IAP receipt validation (sandbox + production)
// BULLETPROOF: Works with or without user session - uses user_id from request body as fallback
// by Henry Dean Bondah, updated for session-independent activation

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const APPLE_SHARED_SECRET = Deno.env.get('APPLE_SHARED_SECRET') || ''
const APPLE_ENVIRONMENT = Deno.env.get('APPLE_ENVIRONMENT') || 'auto' // "sandbox" | "production" | "auto"

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

/**
 * Validate Apple receipt (sandbox or production)
 */
async function validateReceiptWithApple(receiptData: string, isProduction: boolean) {
  const url = isProduction
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt'

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)

    console.log(`[IAP-RECEIPT-VALIDATOR] Validating with ${isProduction ? 'PRODUCTION' : 'SANDBOX'} endpoint...`)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': APPLE_SHARED_SECRET,
        'exclude-old-transactions': true,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const result = await response.json()

    console.log('[IAP-RECEIPT-VALIDATOR] Apple response:', {
      status: result.status,
      environment: isProduction ? 'production' : 'sandbox',
      hasReceipt: !!result.receipt,
      hasLatestReceiptInfo: !!result.latest_receipt_info,
    })

    return result
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[IAP-RECEIPT-VALIDATOR] Timeout after 45s')
      throw new Error('Receipt validation timeout')
    }
    console.error('[IAP-RECEIPT-VALIDATOR] Error validating with Apple:', err)
    throw err
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    console.log('🔍 [IAP-RECEIPT-VALIDATOR] New request')

    const supabaseClient = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '')

    // 1️⃣ Parse request body FIRST to get user_id fallback
    const requestBody = await req.json()
    const { receiptData, productId, user_id: bodyUserId } = requestBody
    
    if (!receiptData) return json(400, { error: 'Receipt data required' })

    // 2️⃣ Try to get user from auth header, but DON'T FAIL if missing - use bodyUserId as fallback
    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token)
      if (!userError && userData.user) {
        userId = userData.user.id
        console.log('[IAP-RECEIPT-VALIDATOR] User authenticated via token:', userId)
      }
    }

    // 3️⃣ Fallback to user_id from request body (for session-expired scenarios)
    if (!userId && bodyUserId && typeof bodyUserId === 'string') {
      // Verify the user exists in our database before accepting
      const { data: profileData, error: profileError } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('id', bodyUserId)
        .single()
      
      if (!profileError && profileData) {
        userId = bodyUserId
        console.log('[IAP-RECEIPT-VALIDATOR] User identified via body user_id:', userId)
      }
    }

    if (!userId) {
      console.error('[IAP-RECEIPT-VALIDATOR] No valid user identification found')
      return json(401, { error: 'User identification required (auth token or valid user_id)' })
    }

    console.log('🧾 Validating receipt for product:', productId, 'user:', userId)

    // 4️⃣ Decide initial environment
    let isProductionStart = true
    if (APPLE_ENVIRONMENT === 'sandbox') isProductionStart = false
    else if (APPLE_ENVIRONMENT === 'production') isProductionStart = true

    // 5️⃣ Validate with Apple
    let appleResponse = await validateReceiptWithApple(receiptData, isProductionStart)

    // 6️⃣ Handle sandbox/production mismatch
    if (appleResponse.status === 21007) {
      console.log('↩️ Sandbox receipt detected (21007) → retrying SANDBOX')
      appleResponse = await validateReceiptWithApple(receiptData, false)
    } else if (appleResponse.status === 21008) {
      console.log('↩️ Production receipt detected (21008) → retrying PRODUCTION')
      appleResponse = await validateReceiptWithApple(receiptData, true)
    } else if (APPLE_ENVIRONMENT === 'sandbox' && appleResponse.status !== 0) {
      console.log('🔁 Force sandbox retry (APPLE_ENVIRONMENT=sandbox)')
      appleResponse = await validateReceiptWithApple(receiptData, false)
    }

    console.log('✅ Final Apple status:', appleResponse.status)

    if (appleResponse.status !== 0) {
      console.error('[❌] Receipt validation failed:', appleResponse.status)

      await supabaseClient.rpc('handle_payment_failure', {
        p_user_id: userId,
        p_reason: `IAP validation failed: status ${appleResponse.status}`,
      })

      return json(400, { valid: false, status: appleResponse.status, error: 'Invalid receipt' })
    }

    // 7️⃣ Process valid receipt
    const receipt = appleResponse.receipt
    const allTransactions = [
      ...(receipt?.in_app || []),
      ...(appleResponse.latest_receipt_info || []),
    ]

    // Accept all possible product IDs (Apple and Google formats)
    const VALID_PRODUCT_IDS = [
      // Apple product IDs
      'com.driplove.dating.premium.monthlysub2',
      'com.driplove.dating.premium.monthlysub3',
      // Google Play product IDs
      'premium_monthly',
      'com.driplove.dating.premium.monthly',
    ]

    const relevantTxs = allTransactions.filter(
      (tx) => VALID_PRODUCT_IDS.includes(tx.product_id) || tx.product_id === productId,
    )

    if (relevantTxs.length === 0) {
      console.warn('⚠️ No matching transactions found for product IDs:', VALID_PRODUCT_IDS)
      return json(400, { valid: false, error: 'No relevant transactions found' })
    }

    // Sort by latest purchase
    relevantTxs.sort((a, b) =>
      parseInt(b.purchase_date_ms || '0') - parseInt(a.purchase_date_ms || '0'),
    )

    const latest = relevantTxs[0]
    // original_transaction_id stays constant across every renewal of a given
    // subscription (transaction_id changes each renewal), so it's the right
    // identifier for "is this the same underlying subscription" checks.
    const originalTransactionId = latest.original_transaction_id || latest.transaction_id
    const expiresDate = latest.expires_date_ms
      ? new Date(parseInt(latest.expires_date_ms))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const isActive = expiresDate > new Date()

    console.log('🧩 Transaction:', {
      productId: latest.product_id,
      transactionId: latest.transaction_id,
      expires: expiresDate.toISOString(),
      isActive,
    })

    // 8️⃣ IDEMPOTENCY CHECK: Check if this transaction was already processed
    const { data: existingSub } = await supabaseClient
      .from('user_subscriptions')
      .select('id, provider_transaction_id, expires_at')
      .eq('user_id', userId)
      .eq('provider_transaction_id', latest.transaction_id)
      .single()

    if (existingSub && new Date(existingSub.expires_at) >= expiresDate) {
      console.log('ℹ️ [IAP-RECEIPT-VALIDATOR] Transaction already processed, skipping update')
      return json(200, {
        valid: true,
        active: true,
        expires_at: existingSub.expires_at,
        transaction_id: latest.transaction_id,
        already_processed: true,
      })
    }

    // Apple marks every transaction started under a free trial or intro offer
    // with is_trial_period/is_in_intro_offer_period = "true" even though $0
    // was charged. Persisting this lets the admin (and the promoter portal)
    // show "Pending (Trial)" instead of counting these as paid Premium users.
    const isTrialTransaction = latest.is_trial_period === 'true' || latest.is_in_intro_offer_period === 'true'

    // 9️⃣ Update Supabase
    if (isActive) {
      const { error } = await supabaseClient
        .from('user_subscriptions')
        .upsert({
          user_id: userId,
          plan_name: 'premium',
          status: 'active',
          starts_at: new Date().toISOString(),
          expires_at: expiresDate.toISOString(),
          next_billing_date: expiresDate.toISOString(),
          provider_transaction_id: latest.transaction_id,
          original_transaction_id: originalTransactionId,
          auto_renew: true,
          payment_method: 'apple',
          is_trial: isTrialTransaction,
          // Lets subscription-checker actually re-verify this subscription
          // with Apple later instead of only re-reading our own expires_at -
          // see 20260926220000_store_apple_receipt_for_reverification.sql.
          latest_receipt_data: receiptData,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (error) {
        // A DB trigger (prevent_shared_iap_subscription) blocks activating
        // premium on this account when the same Apple subscription is
        // already active on a DIFFERENT account -- a device's App Store
        // receipt is shared across every app account signed in on it, so
        // without this check one paid subscription could unlock premium for
        // unlimited accounts. Surface that as a normal "not valid" result
        // (200) rather than a server error (500).
        if (error.message?.includes('IAP_SUBSCRIPTION_ALREADY_LINKED')) {
          console.warn('🚫 [IAP-RECEIPT-VALIDATOR] Subscription already linked to a different account:', userId)
          return json(200, {
            valid: false,
            active: false,
            error: 'This subscription is already linked to a different account. Please use the original account, or contact support.',
          })
        }
        console.error('🔥 Supabase update error:', error)
        return json(500, { error: 'Failed to update subscription' })
      }

      console.log('✅ [IAP-RECEIPT-VALIDATOR] Premium activated for user:', userId)

      // 🔟 Record payment and process referral commission for IAP - but only
      // for a transaction that actually charged the user. Crediting a
      // promoter's commission on a trial transaction would pay them out of
      // revenue that doesn't exist yet, and if the user cancels before the
      // trial converts, it never will. The real post-trial charge fires
      // DID_RENEW on apple-app-store-webhook, which already commissions it.
      if (isTrialTransaction) {
        console.log('[IAP-RECEIPT-VALIDATOR] Trial/intro transaction - skipping commission until a real charge occurs')
        return json(200, {
          valid: true,
          active: true,
          expires_at: expiresDate.toISOString(),
          transaction_id: latest.transaction_id,
        })
      }

      try {
        // Get premium price from payment_config for the user's country
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('country_code')
          .eq('id', userId)
          .single()
        
        const userCountry = profile?.country_code || 'GH'
        
        // Get payment config to determine price
        const { data: paymentConfig } = await supabaseClient
          .from('payment_config')
          .select('premium_price_monthly, currency, country_prices')
          .single()
        
        // Determine price based on country (default to GHS price)
        let paymentAmount = paymentConfig?.premium_price_monthly || 56
        let paymentCurrency = paymentConfig?.currency || 'GHS'
        
        // Check for country-specific pricing
        if (paymentConfig?.country_prices && typeof paymentConfig.country_prices === 'object') {
          const countryPrices = paymentConfig.country_prices as Record<string, { price: number; currency: string }>
          if (countryPrices[userCountry]) {
            paymentAmount = countryPrices[userCountry].price
            paymentCurrency = countryPrices[userCountry].currency
          }
        }
        
        // Record the payment
        const { data: paymentRecord, error: paymentError } = await supabaseClient
          .from('subscription_payments')
          .insert({
            user_id: userId,
            amount: paymentAmount,
            currency: paymentCurrency,
            payment_method: 'apple',
            transaction_id: `iap_${latest.transaction_id}`,
          })
          .select('id')
          .single()

        if (paymentError) {
          console.error('[IAP-RECEIPT-VALIDATOR] Error recording payment:', paymentError)
        } else if (paymentRecord?.id) {
          // Process referral commission
          const { data: commissionResult, error: commissionError } = await supabaseClient.rpc('process_referral_commission', {
            p_user_id: userId,
            p_payment_amount: paymentAmount,
            p_payment_id: paymentRecord.id
          })
          
          if (commissionError) {
            console.error('[IAP-RECEIPT-VALIDATOR] Error processing commission:', commissionError)
          } else {
            console.log('[IAP-RECEIPT-VALIDATOR] Commission result:', commissionResult)
          }
        }
      } catch (commErr) {
        console.error('[IAP-RECEIPT-VALIDATOR] Payment/commission processing failed:', commErr)
      }

      return json(200, {
        valid: true,
        active: true,
        expires_at: expiresDate.toISOString(),
        transaction_id: latest.transaction_id,
      })
    } else {
      // Expired
      await supabaseClient.rpc('handle_payment_failure', {
        p_user_id: userId,
        p_reason: 'IAP subscription expired',
      })

      return json(200, {
        valid: true,
        active: false,
        expires_at: expiresDate.toISOString(),
        message: 'Subscription expired',
      })
    }
  } catch (err) {
    console.error('💥 [IAP-RECEIPT-VALIDATOR] Error:', err)
    return json(500, { error: 'Internal server error' })
  }
})
