// Supabase Edge Function: google-play-webhook
// Handles Google Play Real-time Developer Notifications (RTDN)
// Detects subscription cancellations, renewals, and expirations in real-time
// FIXED: Now verifies with Google API for accurate expiry times

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

// ========== Google API Authentication ==========
function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string
  if (typeof data === 'string') {
    base64 = btoa(data)
  } else {
    const bytes = new Uint8Array(data)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    base64 = btoa(binary)
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function generateAccessToken(serviceAccount: any, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
    scope,
  }

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signatureInput = `${encodedHeader}.${encodedPayload}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput),
  )

  const encodedSignature = base64UrlEncode(signature)
  const jwt = `${signatureInput}.${encodedSignature}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenData?.access_token) {
    throw new Error(`Failed to get Google OAuth token: ${tokenResponse.status}`)
  }
  return tokenData.access_token
}

async function getAndroidPublisherAccessToken(): Promise<string> {
  const base64Json = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT') ||
                     Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
  if (!base64Json) {
    throw new Error('Missing service account secret')
  }
  const serviceAccountJson = atob(base64Json)
  const serviceAccount = JSON.parse(serviceAccountJson)
  return await generateAccessToken(serviceAccount, 'https://www.googleapis.com/auth/androidpublisher')
}

// ========== Google API Verification ==========
interface GoogleSubscriptionData {
  expiryTimeMillis: number
  startTimeMillis: number
  autoRenewing: boolean
  paymentState?: number
  cancelReason?: number
}

async function verifyWithGoogleAPI(
  accessToken: string,
  purchaseToken: string,
  subscriptionId?: string
): Promise<GoogleSubscriptionData | null> {
  // Try with provided subscriptionId first, then fallback to known IDs
  const subscriptionIds = subscriptionId 
    ? [subscriptionId, 'premium_monthly', 'monthly']
    : ['premium_monthly', 'monthly']

  // Try v3 endpoint with each subscription ID
  for (const subId of subscriptionIds) {
    try {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}/purchases/subscriptions/${subId}/tokens/${purchaseToken}`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(`[GOOGLE-WEBHOOK] ✅ Google API verified with subscriptionId=${subId}`)
        return {
          expiryTimeMillis: Number(data.expiryTimeMillis),
          startTimeMillis: Number(data.startTimeMillis),
          autoRenewing: data.autoRenewing === true,
          paymentState: data.paymentState,
          cancelReason: data.cancelReason,
        }
      }
    } catch (err) {
      console.warn(`[GOOGLE-WEBHOOK] v3 attempt failed for ${subId}:`, err)
    }
  }

  // Fallback to v2 token-only endpoint
  try {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${purchaseToken}`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('[GOOGLE-WEBHOOK] ✅ Google API verified via v2 endpoint')
      
      const firstLineItem = Array.isArray(data.lineItems) ? data.lineItems[0] : null
      const expiryTime = firstLineItem?.expiryTime
      const startTime = firstLineItem?.startTime
      
      return {
        expiryTimeMillis: expiryTime ? Date.parse(expiryTime) : 0,
        startTimeMillis: startTime ? Date.parse(startTime) : 0,
        autoRenewing: !!firstLineItem?.autoRenewingPlan,
      }
    }
  } catch (err) {
    console.warn('[GOOGLE-WEBHOOK] v2 endpoint failed:', err)
  }

  return null
}

// ========== Database Operations ==========
async function findUserByPurchaseToken(supabase: any, purchaseToken: string) {
  try {
    // Use maybeSingle() to handle duplicates gracefully
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, plan_name, expires_at, payment_attempts, provider_transaction_id')
      .eq('provider_transaction_id', purchaseToken)
      .eq('payment_method', 'google')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    if (error) {
      console.log(`[GOOGLE-WEBHOOK] Error finding subscription:`, error)
      return null
    }
    
    if (!data) {
      console.log(`[GOOGLE-WEBHOOK] No subscription found for purchase token: ${purchaseToken?.substring(0, 20)}...`)
      return null
    }
    
    console.log(`[GOOGLE-WEBHOOK] Found subscription for user: ${data.user_id}`)
    return data
  } catch (error) {
    console.error('[GOOGLE-WEBHOOK] Error finding user:', error)
    return null
  }
}

// Records a subscription_payments row and processes referral commission for a
// real charge event (renewal, recovery, or restart). Without this, an
// influencer's commission_duration setting (e.g. "earn for 6 months") was
// meaningless for Android subscribers - the very first payment is commissioned
// by google-iap-validator at purchase time, but every subsequent charge (which
// arrives here via RTDN, never re-invoking the validator) was silently never
// commissioned. transactionTag must be unique per charge (e.g. includes the new
// expiry timestamp) so repeated notifications for the same charge don't insert
// duplicate payment rows.
async function recordPaymentAndCommission(
  supabase: any,
  userId: string,
  purchaseToken: string,
  transactionTag: string
) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('country_code')
      .eq('id', userId)
      .single()

    const userCountry = profile?.country_code || 'US'

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
        payment_method: 'google',
        transaction_id: `google_${transactionTag}_${purchaseToken.slice(-16)}`,
      })
      .select('id')
      .single()

    if (!paymentError && paymentRecord?.id) {
      await supabase.rpc('process_referral_commission', {
        p_user_id: userId,
        p_payment_amount: paymentAmount,
        p_payment_id: paymentRecord.id,
      })
    } else if (paymentError) {
      console.error('[GOOGLE-WEBHOOK] Error recording payment:', paymentError)
    }
  } catch (err) {
    console.error('[GOOGLE-WEBHOOK] Payment/commission processing failed:', err)
  }
}

async function updateSubscriptionByToken(
  supabase: any,
  purchaseToken: string,
  updates: Record<string, any>
) {
  // Update by provider_transaction_id to avoid hitting wrong rows
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('provider_transaction_id', purchaseToken)
    .eq('payment_method', 'google')

  return { error }
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
      // Return 200 to acknowledge - don't want Google retrying forever
      return json(200, { message: 'No message data found, acknowledged' })
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
    const notificationTypeName = Object.keys(NOTIFICATION_TYPES).find(
      key => NOTIFICATION_TYPES[key as keyof typeof NOTIFICATION_TYPES] === notificationType
    )
    
    console.log('[GOOGLE-WEBHOOK] Processing notification:', {
      type: notificationType,
      typeName: notificationTypeName,
      purchaseToken: purchaseToken?.substring(0, 20) + '...',
      subscriptionId,
      packageName,
    })
    
    // Verify package name
    if (packageName !== GOOGLE_PACKAGE_NAME) {
      console.warn('[GOOGLE-WEBHOOK] Package name mismatch:', packageName, 'vs', GOOGLE_PACKAGE_NAME)
      // Still return 200 to prevent retries
      return json(200, { message: 'Package name mismatch, acknowledged' })
    }

    // Get Google API access token for verification
    let accessToken: string | null = null
    let googleData: GoogleSubscriptionData | null = null
    
    try {
      accessToken = await getAndroidPublisherAccessToken()
      googleData = await verifyWithGoogleAPI(accessToken, purchaseToken, subscriptionId)
    } catch (err) {
      console.error('[GOOGLE-WEBHOOK] Failed to verify with Google API:', err)
      // Continue processing - we'll use fallback logic
    }

    // Find user subscription
    const subscription = await findUserByPurchaseToken(supabase, purchaseToken)
    
    // Handle different notification types
    switch (notificationType) {
      case NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED:
        console.log(`[GOOGLE-WEBHOOK] 🆕 New subscription purchased`)
        
        // For new purchases, the subscription may not exist yet in our DB
        // The google-iap-validator handles initial creation
        // But if we have the data, we can verify/update
        if (googleData && subscription) {
          const expiresAt = new Date(googleData.expiryTimeMillis).toISOString()
          const startsAt = new Date(googleData.startTimeMillis).toISOString()
          
          const { error } = await updateSubscriptionByToken(supabase, purchaseToken, {
            status: 'active',
            plan_name: 'premium',
            expires_at: expiresAt,
            starts_at: startsAt,
            next_billing_date: expiresAt,
            auto_renew: googleData.autoRenewing,
            payment_attempts: 0,
          })
          
          if (error) {
            console.error('[GOOGLE-WEBHOOK] Error updating purchase:', error)
          } else {
            console.log('[GOOGLE-WEBHOOK] ✅ Purchase confirmed until:', expiresAt)
          }
        } else if (!subscription) {
          // Log that we received a PURCHASED event but don't have the subscription yet
          // This is normal - the app's validator should create it
          console.log('[GOOGLE-WEBHOOK] ℹ️ PURCHASED event but subscription not in DB yet (will be created by validator)')
        }
        break

      case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED:
        console.log(`[GOOGLE-WEBHOOK] 🔄 Subscription renewed`)
        
        if (!subscription) {
          console.log('[GOOGLE-WEBHOOK] ⚠️ Subscription not found for renewal - logging for investigation')
          // Return 200 to prevent retries, but log the issue
          return json(200, { 
            message: 'Renewal notification received but subscription not found',
            purchaseToken: purchaseToken?.substring(0, 20) + '...'
          })
        }
        
        // CRITICAL FIX: Use actual expiry from Google API, not hardcoded 30 days
        let newExpiry: Date
        let autoRenew = true
        
        if (googleData && googleData.expiryTimeMillis > Date.now()) {
          // Use Google's actual expiry time
          newExpiry = new Date(googleData.expiryTimeMillis)
          autoRenew = googleData.autoRenewing
          console.log('[GOOGLE-WEBHOOK] Using Google API expiry:', newExpiry.toISOString())
        } else {
          // Fallback: If Google API failed, estimate 30 days from now
          // This is a safety net, not the primary source
          newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          console.warn('[GOOGLE-WEBHOOK] ⚠️ Using fallback 30-day expiry (Google API unavailable)')
        }
        
        const { error: renewError } = await updateSubscriptionByToken(supabase, purchaseToken, {
          // If user has turned off auto-renew in Play Store, mark as cancelled (still premium until expires_at)
          status: autoRenew ? 'active' : 'cancelled',
          plan_name: 'premium',
          expires_at: newExpiry.toISOString(),
          next_billing_date: newExpiry.toISOString(),
          payment_attempts: 0,
          auto_renew: autoRenew,
          // RENEWED always means Google actually charged the card - clear any
          // trial flag so this converts from "Pending (Trial)" to Premium.
          is_trial: false,
        })
        
        if (renewError) {
          console.error('[GOOGLE-WEBHOOK] Error renewing subscription:', renewError)
          return json(500, { error: 'Failed to renew subscription' })
        }

        console.log('[GOOGLE-WEBHOOK] ✅ Subscription renewed until:', newExpiry.toISOString())

        await recordPaymentAndCommission(
          supabase,
          subscription.user_id,
          purchaseToken,
          `renew_${newExpiry.getTime()}`
        )
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED:
        console.log(`[GOOGLE-WEBHOOK] 🚫 Subscription canceled via Play Store`)
        
        if (!subscription) {
          return json(200, { message: 'Subscription not found for cancellation' })
        }
        
        // Get actual expiry from Google - user keeps access until then
        let cancelExpiry = subscription.expires_at
        if (googleData && googleData.expiryTimeMillis > Date.now()) {
          cancelExpiry = new Date(googleData.expiryTimeMillis).toISOString()
        }
        
        const { error: cancelError } = await updateSubscriptionByToken(supabase, purchaseToken, {
          status: 'cancelled',
          auto_renew: false,
          expires_at: cancelExpiry, // Keep access until actual expiry
        })
        
        if (cancelError) {
          console.error('[GOOGLE-WEBHOOK] Error updating subscription:', cancelError)
          return json(500, { error: 'Failed to update subscription' })
        }
        
        console.log('[GOOGLE-WEBHOOK] ✅ Cancellation requested, user keeps premium until:', cancelExpiry)
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
        console.log(`[GOOGLE-WEBHOOK] ⏰ Subscription expired`)
        
        if (!subscription) {
          return json(200, { message: 'Subscription not found for expiration' })
        }
        
        // Verify it's actually expired via Google API
        if (googleData && googleData.expiryTimeMillis > Date.now()) {
          // Google says it's still active! Don't expire it
          console.warn('[GOOGLE-WEBHOOK] ⚠️ Received EXPIRED but Google API says still active')
          const { error } = await updateSubscriptionByToken(supabase, purchaseToken, {
            status: googleData.autoRenewing ? 'active' : 'cancelled',
            expires_at: new Date(googleData.expiryTimeMillis).toISOString(),
            auto_renew: googleData.autoRenewing,
          })
          if (!error) {
            console.log('[GOOGLE-WEBHOOK] ✅ Corrected to active based on Google API')
          }
          break
        }

        // SAFEGUARD: if our DB still shows entitlement time remaining, do NOT downgrade.
        // This prevents wrong expirations when Google API verification is temporarily unavailable/stale.
        const dbExpiryMs = subscription.expires_at ? new Date(subscription.expires_at).getTime() : NaN
        const dbStillEntitled = Number.isFinite(dbExpiryMs) && dbExpiryMs > Date.now()
        if (dbStillEntitled) {
          console.warn(
            `[GOOGLE-WEBHOOK] 🛡️ Skipping downgrade on EXPIRED: DB expires_at=${subscription.expires_at} still in future for user ${subscription.user_id}`
          )
          // Keep them active/premium; the hourly subscription-checker will reconcile once Google API is available.
          await updateSubscriptionByToken(supabase, purchaseToken, {
            status: subscription.auto_renew ? 'active' : 'cancelled',
            plan_name: 'premium',
          })
          break
        }
        
        // Downgrade to free
        const { error: expireError } = await supabase.rpc('handle_payment_failure', {
          p_user_id: subscription.user_id,
          p_reason: 'Google Play subscription expired (RTDN notification)'
        })
        
        if (expireError) {
          console.error('[GOOGLE-WEBHOOK] Error handling expiration:', expireError)
          return json(500, { error: 'Failed to handle expiration' })
        }
        
        console.log('[GOOGLE-WEBHOOK] ✅ Subscription expired and downgraded')
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_REVOKED:
        console.log(`[GOOGLE-WEBHOOK] ⚠️ Subscription revoked`)
        
        if (!subscription) {
          return json(200, { message: 'Subscription not found for revocation' })
        }
        
        // Immediate downgrade for revoked subscriptions (refund/chargeback)
        const { error: revokeError } = await supabase.rpc('handle_payment_failure', {
          p_user_id: subscription.user_id,
          p_reason: 'Google Play subscription revoked (refund or chargeback)'
        })
        
        if (revokeError) {
          console.error('[GOOGLE-WEBHOOK] Error handling revocation:', revokeError)
          return json(500, { error: 'Failed to handle revocation' })
        }
        
        console.log('[GOOGLE-WEBHOOK] ✅ Subscription revoked and downgraded')
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_ON_HOLD:
      case NOTIFICATION_TYPES.SUBSCRIPTION_IN_GRACE_PERIOD:
        console.log(`[GOOGLE-WEBHOOK] ⏸️ Subscription on hold/grace period`)
        
        if (!subscription) {
          return json(200, { message: 'Subscription not found' })
        }
        
        // Mark as payment pending but DON'T immediately revoke access
        // Grace period means user still has access while payment retries
        const { error: holdError } = await updateSubscriptionByToken(supabase, purchaseToken, {
          status: 'payment_pending',
          payment_attempts: (subscription.payment_attempts || 0) + 1,
          // Keep current expiry - grace period extends access
        })
        
        if (holdError) {
          console.error('[GOOGLE-WEBHOOK] Error updating hold status:', holdError)
        }
        break
      
      case NOTIFICATION_TYPES.SUBSCRIPTION_RECOVERED:
      case NOTIFICATION_TYPES.SUBSCRIPTION_RESTARTED:
        console.log(`[GOOGLE-WEBHOOK] ✅ Subscription recovered/restarted`)
        
        if (!subscription) {
          console.log('[GOOGLE-WEBHOOK] ⚠️ Subscription not found for recovery')
          return json(200, { message: 'Subscription not found for recovery' })
        }
        
        // Use Google API for accurate expiry
        let recoveryExpiry: string
        let recoveryAutoRenew = true
        
        if (googleData && googleData.expiryTimeMillis > Date.now()) {
          recoveryExpiry = new Date(googleData.expiryTimeMillis).toISOString()
          recoveryAutoRenew = googleData.autoRenewing
        } else {
          // Fallback: extend 30 days from now
          recoveryExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          console.warn('[GOOGLE-WEBHOOK] ⚠️ Using fallback expiry for recovery')
        }
        
        const { error: recoverError } = await updateSubscriptionByToken(supabase, purchaseToken, {
          status: 'active',
          plan_name: 'premium',
          expires_at: recoveryExpiry,
          next_billing_date: recoveryExpiry,
          payment_attempts: 0,
          auto_renew: recoveryAutoRenew,
        })
        
        if (recoverError) {
          console.error('[GOOGLE-WEBHOOK] Error recovering subscription:', recoverError)
        } else {
          console.log('[GOOGLE-WEBHOOK] ✅ Subscription recovered until:', recoveryExpiry)

          // SUBSCRIPTION_RECOVERED (billing retry succeeded) and
          // SUBSCRIPTION_RESTARTED (user resubscribed before expiry) both
          // represent a real charge, same as a normal renewal.
          await recordPaymentAndCommission(
            supabase,
            subscription.user_id,
            purchaseToken,
            `recover_${new Date(recoveryExpiry).getTime()}`
          )
        }
        break
      
      default:
        console.log(`[GOOGLE-WEBHOOK] Unhandled notification type: ${notificationType} (${notificationTypeName})`)
    }
    
    // Always return 200 to acknowledge receipt - prevents Google from retrying
    return json(200, { 
      success: true,
      message: 'Notification processed',
      notificationType: notificationTypeName,
      verifiedWithGoogle: !!googleData,
    })
    
  } catch (err) {
    console.error('💥 [GOOGLE-WEBHOOK] Error:', err)
    // Return 200 even on error to prevent infinite retries
    // Log the error for investigation but don't block Google
    return json(200, { 
      error: 'Internal error occurred but acknowledged',
      details: String(err)
    })
  }
})
