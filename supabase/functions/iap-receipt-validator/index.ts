// Supabase Edge Function: iap-receipt-validator
// Validates Apple IAP receipts and handles subscription status updates
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

async function validateReceiptWithApple(receiptData: string, isProduction: boolean = false) {
  const url = isProduction 
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt'
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': '', // App-specific shared secret if needed
        'exclude-old-transactions': true
      })
    })
    
    const result = await response.json()
    
    // If sandbox receipt sent to production, try sandbox
    if (result.status === 21007 && isProduction) {
      return await validateReceiptWithApple(receiptData, false)
    }
    
    return result
  } catch (error) {
    console.error('Apple receipt validation error:', error)
    throw error
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[IAP-RECEIPT-VALIDATOR] Validating IAP receipt')
    
    const supabaseClient = createClient(
      SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY ?? ''
    )

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(401, { error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !userData.user) {
      return json(401, { error: 'Invalid user token' })
    }

    const { receiptData, productId } = await req.json()
    if (!receiptData) {
      return json(400, { error: 'Receipt data required' })
    }

    console.log('[IAP-RECEIPT-VALIDATOR] Validating receipt with Apple')
    
    // Validate with Apple (try production first, then sandbox)
    let appleResponse
    try {
      appleResponse = await validateReceiptWithApple(receiptData, true)
    } catch (error) {
      console.log('[IAP-RECEIPT-VALIDATOR] Production validation failed, trying sandbox')
      appleResponse = await validateReceiptWithApple(receiptData, false)
    }

    console.log('[IAP-RECEIPT-VALIDATOR] Apple response status:', appleResponse.status)

    if (appleResponse.status !== 0) {
      console.error('[IAP-RECEIPT-VALIDATOR] Receipt validation failed:', appleResponse)
      
      // Handle failed receipt - downgrade subscription
      const { error: failureError } = await supabaseClient.rpc('handle_payment_failure', {
        p_user_id: userData.user.id,
        p_reason: `IAP receipt validation failed: status ${appleResponse.status}`
      })

      if (failureError) {
        console.error('[IAP-RECEIPT-VALIDATOR] Error handling payment failure:', failureError)
      }

      return json(400, { 
        error: 'Receipt validation failed', 
        status: appleResponse.status,
        valid: false
      })
    }

    // Receipt is valid - check for active subscription
    const receipt = appleResponse.receipt
    const inAppPurchases = receipt.in_app || []
    const latestReceiptInfo = appleResponse.latest_receipt_info || []
    
    // Find the most recent transaction for this product
    const allTransactions = [...inAppPurchases, ...latestReceiptInfo]
    const relevantTransactions = allTransactions.filter(transaction => 
      transaction.product_id === productId ||
      transaction.product_id === 'com.driplove.dating.premium.monthlysub' ||
      transaction.product_id === 'com.driplove.dating.premium.monthly'
    )

    if (relevantTransactions.length === 0) {
      console.log('[IAP-RECEIPT-VALIDATOR] No relevant transactions found')
      return json(400, { error: 'No relevant transactions found', valid: false })
    }

    // Sort by purchase date and get the latest
    relevantTransactions.sort((a, b) => 
      parseInt(b.purchase_date_ms || b.original_purchase_date_ms || '0') - 
      parseInt(a.purchase_date_ms || a.original_purchase_date_ms || '0')
    )

    const latestTransaction = relevantTransactions[0]
    const expiresDate = latestTransaction.expires_date_ms 
      ? new Date(parseInt(latestTransaction.expires_date_ms))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days default

    const isActive = expiresDate > new Date()

    console.log('[IAP-RECEIPT-VALIDATOR] Transaction details:', {
      productId: latestTransaction.product_id,
      transactionId: latestTransaction.transaction_id,
      expiresDate: expiresDate.toISOString(),
      isActive
    })

    if (isActive) {
      // Update subscription to active premium
      const { error: updateError } = await supabaseClient
        .from('user_subscriptions')
        .upsert({
          user_id: userData.user.id,
          plan_name: 'premium',
          status: 'active',
          starts_at: new Date().toISOString(),
          expires_at: expiresDate.toISOString(),
          next_billing_date: expiresDate.toISOString(),
          flutterwave_transaction_id: latestTransaction.transaction_id,
          auto_renew: true,
          payment_method: 'apple',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        })

      if (updateError) {
        console.error('[IAP-RECEIPT-VALIDATOR] Error updating subscription:', updateError)
        return json(500, { error: 'Failed to update subscription' })
      }

      console.log('[IAP-RECEIPT-VALIDATOR] Successfully validated and updated subscription')
      return json(200, { 
        valid: true, 
        active: true,
        expires_at: expiresDate.toISOString(),
        transaction_id: latestTransaction.transaction_id
      })
    } else {
      // Subscription expired
      const { error: failureError } = await supabaseClient.rpc('handle_payment_failure', {
        p_user_id: userData.user.id,
        p_reason: 'IAP subscription expired'
      })

      if (failureError) {
        console.error('[IAP-RECEIPT-VALIDATOR] Error handling expired subscription:', failureError)
      }

      return json(200, { 
        valid: true, 
        active: false,
        expires_at: expiresDate.toISOString(),
        message: 'Subscription has expired'
      })
    }

  } catch (error) {
    console.error('[IAP-RECEIPT-VALIDATOR] Error:', error)
    return json(500, { error: 'Internal server error' })
  }
})