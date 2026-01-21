// Supabase Edge Function: apple-app-store-webhook
// Receives App Store Server Notifications for subscription events
// Automatically activates/expires subscriptions based on Apple's real-time notifications
// Documentation: https://developer.apple.com/documentation/appstoreservernotifications

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const APPLE_SHARED_SECRET = Deno.env.get('APPLE_SHARED_SECRET') || ''

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

// Validate Apple receipt to get actual expiry time
async function validateReceiptWithApple(receiptData: string, isProduction: boolean) {
  const url = isProduction
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt'

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': APPLE_SHARED_SECRET,
        'exclude-old-transactions': true,
      }),
    })

    const result = await response.json()
    
    // Handle sandbox/production mismatch
    if (result.status === 21007) {
      console.log('[APPLE-WEBHOOK] Retrying with sandbox endpoint (21007)')
      return validateReceiptWithApple(receiptData, false)
    } else if (result.status === 21008) {
      console.log('[APPLE-WEBHOOK] Retrying with production endpoint (21008)')
      return validateReceiptWithApple(receiptData, true)
    }

    return result
  } catch (err) {
    console.error('[APPLE-WEBHOOK] Error validating with Apple:', err)
    throw err
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[APPLE-WEBHOOK] 🍎 Received App Store Server Notification')
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const body = await req.json()
    
    console.log('[APPLE-WEBHOOK] Notification type:', body.notification_type)
    console.log('[APPLE-WEBHOOK] Environment:', body.environment)
    
    // Extract transaction details from the unified_receipt or latest_receipt_info
    const receiptData = body.latest_receipt || body.unified_receipt?.latest_receipt
    const transactionInfo = body.latest_receipt_info?.[0] || 
                          body.unified_receipt?.latest_receipt_info?.[0]
    
    if (!transactionInfo) {
      console.warn('[APPLE-WEBHOOK] No transaction info found in notification')
      return json(200, { message: 'No transaction info' })
    }
    
    const transactionId = transactionInfo.transaction_id || transactionInfo.original_transaction_id
    const productId = transactionInfo.product_id
    const expiresDateMs = transactionInfo.expires_date_ms
    
    console.log('[APPLE-WEBHOOK] Transaction:', {
      transactionId,
      productId,
      expiresDateMs: expiresDateMs ? new Date(parseInt(expiresDateMs)).toISOString() : 'none'
    })
    
    // Find user by transaction ID
    const { data: existingSub, error: findError } = await supabase
      .from('user_subscriptions')
      .select('user_id, id, status, expires_at')
      .eq('provider_transaction_id', transactionId)
      .single()
    
    if (findError && findError.code !== 'PGRST116') {
      console.error('[APPLE-WEBHOOK] Error finding subscription:', findError)
      return json(200, { message: 'User not found, webhook acknowledged' })
    }
    
    const userId = existingSub?.user_id
    
    if (!userId) {
      console.warn('[APPLE-WEBHOOK] No user found for transaction:', transactionId)
      return json(200, { message: 'No user found' })
    }
    
    // Handle different notification types
    const notificationType = body.notification_type
    
    switch (notificationType) {
      case 'INITIAL_BUY':
      case 'DID_RENEW':
      case 'INTERACTIVE_RENEWAL':
      case 'DID_RECOVER': {
        console.log(`[APPLE-WEBHOOK] ✅ Activating subscription for user ${userId}`)
        
        // Get actual expiry time from Apple
        let expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days
        
        if (expiresDateMs) {
          expiresAt = new Date(parseInt(expiresDateMs))
        } else if (receiptData) {
          // Validate receipt to get accurate expiry
          try {
            const receiptResult = await validateReceiptWithApple(
              receiptData,
              body.environment === 'PROD'
            )
            
            if (receiptResult.status === 0) {
              const latestInfo = receiptResult.latest_receipt_info?.[0]
              if (latestInfo?.expires_date_ms) {
                expiresAt = new Date(parseInt(latestInfo.expires_date_ms))
              }
            }
          } catch (err) {
            console.error('[APPLE-WEBHOOK] Could not validate receipt, using default expiry')
          }
        }
        
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .upsert({
            user_id: userId,
            plan_name: 'premium',
            status: 'active',
            starts_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            next_billing_date: expiresAt.toISOString(),
            provider_transaction_id: transactionId,
            auto_renew: true,
            payment_method: 'apple',
            payment_attempts: 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
        
        if (updateError) {
          console.error('[APPLE-WEBHOOK] Error updating subscription:', updateError)
          return json(500, { error: 'Update failed' })
        }
        
        console.log(`[APPLE-WEBHOOK] ✅ Subscription activated until ${expiresAt.toISOString()}`)
        
        // Record payment if it's a renewal
        if (notificationType === 'DID_RENEW') {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('country_code')
              .eq('id', userId)
              .single()
            
            const userCountry = profile?.country_code || 'US'
            
            // Get payment config
            const { data: paymentConfig } = await supabase
              .from('payment_config')
              .select('premium_price_monthly, currency, country_prices')
              .single()
            
            let paymentAmount = paymentConfig?.premium_price_monthly || 56
            let paymentCurrency = paymentConfig?.currency || 'GHS'
            
            if (paymentConfig?.country_prices && typeof paymentConfig.country_prices === 'object') {
              const countryPrices = paymentConfig.country_prices as Record<string, { price: number; currency: string }>
              if (countryPrices[userCountry]) {
                paymentAmount = countryPrices[userCountry].price
                paymentCurrency = countryPrices[userCountry].currency
              }
            }
            
            const { data: paymentRecord, error: paymentError } = await supabase
              .from('subscription_payments')
              .insert({
                user_id: userId,
                amount: paymentAmount,
                currency: paymentCurrency,
                payment_method: 'apple',
                transaction_id: `apple_${transactionId}`,
              })
              .select('id')
              .single()
            
            if (!paymentError && paymentRecord?.id) {
              await supabase.rpc('process_referral_commission', {
                p_user_id: userId,
                p_payment_amount: paymentAmount,
                p_payment_id: paymentRecord.id
              })
            }
          } catch (err) {
            console.error('[APPLE-WEBHOOK] Payment recording failed:', err)
          }
        }
        
        return json(200, { message: 'Subscription activated', user_id: userId })
      }
      
      case 'DID_FAIL_TO_RENEW':
      case 'DID_CHANGE_RENEWAL_STATUS': {
        console.log(`[APPLE-WEBHOOK] ⚠️  Renewal issue or cancellation for user ${userId}`)
        
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            cancellation_requested: true,
            cancellation_requested_at: new Date().toISOString(),
            auto_renew: false,
            // status stays 'active' - user keeps premium until expires_at
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
        
        if (updateError) {
          console.error('[APPLE-WEBHOOK] Error updating status:', updateError)
        }
        
        return json(200, { message: 'Status updated', user_id: userId })
      }
      
      case 'CANCEL':
      case 'EXPIRED':
      case 'REVOKE': {
        console.log(`[APPLE-WEBHOOK] ❌ Subscription ended/canceled for user ${userId}`)
        
        // If CANCEL, set cancellation_requested and keep active until expiry
        if (notificationType === 'CANCEL') {
          const { error: updateError } = await supabase
            .from('user_subscriptions')
            .update({
              cancellation_requested: true,
              cancellation_requested_at: new Date().toISOString(),
              auto_renew: false,
              // status stays 'active' - user keeps premium until expires_at
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
          
          if (updateError) {
            console.error('[APPLE-WEBHOOK] Error updating cancellation:', updateError)
          }
        } else {
          // For EXPIRED/REVOKE, run the expiry handler
          await supabase.rpc('handle_subscription_expiry')
        }
        
        return json(200, { message: 'Subscription ended', user_id: userId })
      }
      
      case 'REFUND': {
        console.log(`[APPLE-WEBHOOK] 💰 Refund issued for user ${userId}`)
        
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'refunded',
            plan_name: 'free',
            auto_renew: false,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
        
        if (updateError) {
          console.error('[APPLE-WEBHOOK] Error processing refund:', updateError)
        }
        
        return json(200, { message: 'Refund processed', user_id: userId })
      }
      
      default:
        console.log(`[APPLE-WEBHOOK] Unhandled notification type: ${notificationType}`)
        return json(200, { message: 'Notification acknowledged' })
    }
    
  } catch (err) {
    console.error('[APPLE-WEBHOOK] 💥 Error:', err)
    return json(500, { error: 'Internal error', details: String(err) })
  }
})
