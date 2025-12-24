// Supabase Edge Function: google-play-webhook
// Handles Google Play Real-time Developer Notifications (RTDN)
// Detects subscription cancellations, renewals, and expirations in real-time

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const GOOGLE_PACKAGE_NAME = Deno.env.get('GOOGLE_PACKAGE_NAME') || 'com.driplove.dating'

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

// Notification types from Google Play
const NOTIFICATION_TYPES = {
  SUBSCRIPTION_RECOVERED: 1,
  SUBSCRIPTION_RENEWED: 2,
  SUBSCRIPTION_CANCELED: 3,
  SUBSCRIPTION_PURCHASED: 4,
  SUBSCRIPTION_ON_HOLD: 5,
  SUBSCRIPTION_IN_GRACE_PERIOD: 6,
  SUBSCRIPTION_RESTARTED: 7,
  SUBSCRIPTION_PRICE_CHANGE_CONFIRMED: 8,
  SUBSCRIPTION_DEFERRED: 9,
  SUBSCRIPTION_PAUSED: 10,
  SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED: 11,
  SUBSCRIPTION_REVOKED: 12,
  SUBSCRIPTION_EXPIRED: 13,
}

async function findUserByPurchaseToken(supabase: any, purchaseToken: string) {
  try {
    // Try to find user by purchase token stored in flutterwave_transaction_id
    // Google stores purchaseToken or transactionId in this field
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('user_id, status, plan_name, expires_at, payment_attempts')
      .eq('flutterwave_transaction_id', purchaseToken)
      .eq('payment_method', 'google')
      .single()
    
    if (error || !data) {
      console.log(`[GOOGLE-WEBHOOK] No subscription found for purchase token: ${purchaseToken?.substring(0, 20)}...`)
      console.log(`[GOOGLE-WEBHOOK] Error details:`, error)
      return null
    }
    
    console.log(`[GOOGLE-WEBHOOK] Found subscription for user: ${data.user_id}`)
    return data
  } catch (error) {
    console.error('[GOOGLE-WEBHOOK] Error finding user:', error)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('🔍 [GOOGLE-WEBHOOK] Webhook received')
    
    const body = await req.text()
    const notification = JSON.parse(body)
    
    console.log('[GOOGLE-WEBHOOK] Notification:', JSON.stringify(notification, null, 2))
    
    // Google sends notifications in this format:
    // { message: { data: "base64-encoded-json", messageId: "...", publishTime: "..." } }
    const messageData = notification.message?.data
    
    if (!messageData) {
      console.log('[GOOGLE-WEBHOOK] No message data found')
      return json(400, { error: 'No message data found' })
    }
    
    // Decode base64 data
    const decodedData = atob(messageData)
    const rtdnData = JSON.parse(decodedData)
    
    console.log('[GOOGLE-WEBHOOK] Decoded RTDN:', JSON.stringify(rtdnData, null, 2))
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    
    // Extract subscription notification
    const subscriptionNotification = rtdnData.subscriptionNotification
    
    if (!subscriptionNotification) {
      console.log('[GOOGLE-WEBHOOK] No subscription notification found')
      return json(200, { message: 'Not a subscription notification' })
    }
    
    const {
      notificationType,
      purchaseToken,
      subscriptionId,
    } = subscriptionNotification
    
    const packageName = rtdnData.packageName
    
    console.log('[GOOGLE-WEBHOOK] Processing notification:', {
      type: notificationType,
      typeName: Object.keys(NOTIFICATION_TYPES).find(key => NOTIFICATION_TYPES[key as keyof typeof NOTIFICATION_TYPES] === notificationType),
      purchaseToken: purchaseToken?.substring(0, 20) + '...',
      subscriptionId,
      packageName,
    })
    
    // Verify package name
    if (packageName !== GOOGLE_PACKAGE_NAME) {
      console.warn('[GOOGLE-WEBHOOK] Package name mismatch:', packageName, 'vs', GOOGLE_PACKAGE_NAME)
      return json(400, { error: 'Package name mismatch' })
    }
    
    // Find user subscription
    const subscription = await findUserByPurchaseToken(supabase, purchaseToken)
    
    if (!subscription) {
      console.log('[GOOGLE-WEBHOOK] Subscription not found for purchase token')
      return json(404, { error: 'Subscription not found' })
    }
    
    const userId = subscription.user_id
    
    // Handle different notification types
    switch (notificationType) {
      case NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED:
        console.log(`[GOOGLE-WEBHOOK] 🚫 Subscription canceled for user: ${userId}`)
        
        // Update subscription to canceled status
        const { error: cancelError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'cancelled',
            auto_renew: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('payment_method', 'google')
        
        if (cancelError) {
          console.error('[GOOGLE-WEBHOOK] Error updating subscription:', cancelError)
          return json(500, { error: 'Failed to update subscription' })
        }
        
        console.log('[GOOGLE-WEBHOOK] ✅ Subscription marked as canceled')
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
        console.log(`[GOOGLE-WEBHOOK] ⏰ Subscription expired for user: ${userId}`)
        
        // Downgrade to free
        const { error: expireError } = await supabase.rpc('handle_payment_failure', {
          p_user_id: userId,
          p_reason: 'Google Play subscription expired (RTDN notification)'
        })
        
        if (expireError) {
          console.error('[GOOGLE-WEBHOOK] Error handling expiration:', expireError)
          return json(500, { error: 'Failed to handle expiration' })
        }
        
        console.log('[GOOGLE-WEBHOOK] ✅ Subscription expired and downgraded')
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_REVOKED:
        console.log(`[GOOGLE-WEBHOOK] ⚠️ Subscription revoked for user: ${userId}`)
        
        // Immediate downgrade for revoked subscriptions
        const { error: revokeError } = await supabase.rpc('handle_payment_failure', {
          p_user_id: userId,
          p_reason: 'Google Play subscription revoked (refund or chargeback)'
        })
        
        if (revokeError) {
          console.error('[GOOGLE-WEBHOOK] Error handling revocation:', revokeError)
          return json(500, { error: 'Failed to handle revocation' })
        }
        
        console.log('[GOOGLE-WEBHOOK] ✅ Subscription revoked and downgraded')
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED:
        console.log(`[GOOGLE-WEBHOOK] 🔄 Subscription renewed for user: ${userId}`)
        
        // Update subscription with new expiry (30 days from now)
        const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        
        const { error: renewError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'active',
            plan_name: 'premium',
            expires_at: newExpiry.toISOString(),
            next_billing_date: newExpiry.toISOString(),
            payment_attempts: 0,
            auto_renew: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('payment_method', 'google')
        
        if (renewError) {
          console.error('[GOOGLE-WEBHOOK] Error renewing subscription:', renewError)
          return json(500, { error: 'Failed to renew subscription' })
        }
        
        console.log('[GOOGLE-WEBHOOK] ✅ Subscription renewed until:', newExpiry.toISOString())
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_ON_HOLD:
      case NOTIFICATION_TYPES.SUBSCRIPTION_IN_GRACE_PERIOD:
        console.log(`[GOOGLE-WEBHOOK] ⏸️ Subscription on hold/grace period for user: ${userId}`)
        
        // Mark as payment pending
        const { error: holdError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'payment_pending',
            payment_attempts: (subscription.payment_attempts || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('payment_method', 'google')
        
        if (holdError) {
          console.error('[GOOGLE-WEBHOOK] Error updating hold status:', holdError)
        }
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_RECOVERED:
      case NOTIFICATION_TYPES.SUBSCRIPTION_RESTARTED:
        console.log(`[GOOGLE-WEBHOOK] ✅ Subscription recovered/restarted for user: ${userId}`)
        
        // Reactivate subscription
        const { error: recoverError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'active',
            plan_name: 'premium',
            payment_attempts: 0,
            auto_renew: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('payment_method', 'google')
        
        if (recoverError) {
          console.error('[GOOGLE-WEBHOOK] Error recovering subscription:', recoverError)
        }
        break
      
      default:
        console.log(`[GOOGLE-WEBHOOK] Unhandled notification type: ${notificationType}`)
    }
    
    // Always return 200 to acknowledge receipt
    return json(200, { 
      success: true,
      message: 'Notification processed',
      notificationType: Object.keys(NOTIFICATION_TYPES).find(key => NOTIFICATION_TYPES[key as keyof typeof NOTIFICATION_TYPES] === notificationType)
    })
    
  } catch (err) {
    console.error('💥 [GOOGLE-WEBHOOK] Error:', err)
    return json(500, { error: 'Internal server error' })
  }
})
