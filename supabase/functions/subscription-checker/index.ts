// Supabase Edge Function: subscription-checker
// Periodically checks and updates subscription statuses
// ENHANCED: Now also handles Google subscription activation/sync (not just expiry)
// Runs hourly via cron job

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const GOOGLE_PACKAGE_NAME = Deno.env.get('GOOGLE_PACKAGE_NAME') || 'com.driplove.dating'
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

// ========== Google API Authentication (for subscription sync) ==========
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

async function getAndroidPublisherAccessToken(): Promise<string | null> {
  try {
    const base64Json = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT') ||
                       Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!base64Json) {
      console.log('[SUBSCRIPTION-CHECKER] No Google service account configured')
      return null
    }
    const serviceAccountJson = atob(base64Json)
    const serviceAccount = JSON.parse(serviceAccountJson)
    return await generateAccessToken(serviceAccount, 'https://www.googleapis.com/auth/androidpublisher')
  } catch (error) {
    console.error('[SUBSCRIPTION-CHECKER] Failed to get Google access token:', error)
    return null
  }
}

async function verifyGoogleSubscription(
  accessToken: string,
  purchaseToken: string
): Promise<{ expiryTimeMillis: number; autoRenewing: boolean } | null> {
  const subscriptionIds = ['premium_monthly', 'monthly']
  
  // Try v3 endpoint
  for (const subId of subscriptionIds) {
    try {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}/purchases/subscriptions/${subId}/tokens/${purchaseToken}`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (response.ok) {
        const data = await response.json()
        return {
          expiryTimeMillis: Number(data.expiryTimeMillis),
          autoRenewing: data.autoRenewing === true,
        }
      }
    } catch {}
  }
  
  // Fallback to v2 endpoint
  try {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${purchaseToken}`
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (response.ok) {
      const data = await response.json()
      const firstLineItem = Array.isArray(data.lineItems) ? data.lineItems[0] : null
      const expiryTime = firstLineItem?.expiryTime
      return {
        expiryTimeMillis: expiryTime ? Date.parse(expiryTime) : 0,
        autoRenewing: !!firstLineItem?.autoRenewingPlan,
      }
    }
  } catch {}
  
  return null
}

// ========== Apple Receipt Validation (for subscription sync) ==========
async function validateAppleReceipt(
  receiptData: string,
  isProduction: boolean
): Promise<{ expiryTimeMillis: number; autoRenewing: boolean; transactionId: string } | null> {
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
      return validateAppleReceipt(receiptData, false)
    } else if (result.status === 21008) {
      return validateAppleReceipt(receiptData, true)
    }
    
    if (result.status !== 0) {
      return null
    }
    
    // Get latest transaction info
    const allTransactions = [
      ...(result.receipt?.in_app || []),
      ...(result.latest_receipt_info || []),
    ]
    
    if (allTransactions.length === 0) return null
    
    // Sort by latest purchase
    allTransactions.sort((a, b) =>
      parseInt(b.purchase_date_ms || '0') - parseInt(a.purchase_date_ms || '0')
    )
    
    const latest = allTransactions[0]
    const expiresDateMs = latest.expires_date_ms
    
    if (!expiresDateMs) return null
    
    return {
      expiryTimeMillis: parseInt(expiresDateMs),
      autoRenewing: latest.is_in_billing_retry_period !== 'true',
      transactionId: latest.transaction_id,
    }
  } catch (err) {
    console.error('[SUBSCRIPTION-CHECKER] Apple validation error:', err)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[SUBSCRIPTION-CHECKER] Starting subscription status check at', new Date().toISOString())
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    
    // ========== STEP 1: Handle expired subscriptions ==========
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
    
    // Run the subscription expiry handler
    const { error: expiryError } = await supabase.rpc('handle_subscription_expiry')
    
    if (expiryError) {
      console.error('[SUBSCRIPTION-CHECKER] Error handling subscription expiry:', expiryError)
    } else {
      console.log('[SUBSCRIPTION-CHECKER] handle_subscription_expiry RPC completed successfully')
    }

    // ========== STEP 2: Sync Google Play subscriptions ==========
    // This catches missed webhooks and ensures DB matches Google's actual state
    let googleSyncStats = { checked: 0, activated: 0, updated: 0, errors: 0 }
    
    const googleAccessToken = await getAndroidPublisherAccessToken()
    
    if (googleAccessToken) {
      console.log('[SUBSCRIPTION-CHECKER] Syncing Google Play subscriptions...')
      
      // Get all Google subscriptions that might need syncing
      const { data: googleSubs } = await supabase
        .from('user_subscriptions')
        .select('id, user_id, provider_transaction_id, expires_at, status, plan_name, auto_renew')
        .eq('payment_method', 'google')
        .in('status', ['active', 'cancelled', 'payment_pending', 'expired', 'payment_failed'])
        .not('provider_transaction_id', 'is', null)
      
      if (googleSubs && googleSubs.length > 0) {
        console.log(`[SUBSCRIPTION-CHECKER] Found ${googleSubs.length} Google subscriptions to check`)
        googleSyncStats.checked = googleSubs.length
        
        for (const sub of googleSubs) {
          try {
            const purchaseToken = sub.provider_transaction_id
            if (!purchaseToken) continue
            
            const googleData = await verifyGoogleSubscription(googleAccessToken, purchaseToken)
            
            if (!googleData) {
              console.log(`[SUBSCRIPTION-CHECKER] Could not verify Google subscription for user ${sub.user_id}`)
              googleSyncStats.errors++
              continue
            }
            
            const isActiveOnGoogle = googleData.expiryTimeMillis > Date.now()
            const googleExpiresAt = new Date(googleData.expiryTimeMillis).toISOString()
            const dbExpiresAt = new Date(sub.expires_at).getTime()
            
            // Check if we need to update
            const statusMismatch = isActiveOnGoogle && sub.status !== 'active'
            const expiryMismatch = Math.abs(dbExpiresAt - googleData.expiryTimeMillis) > 60000 // 1 min tolerance
            const shouldBeExpired = !isActiveOnGoogle && sub.status === 'active'
            
            if (statusMismatch) {
              // ACTIVATION: User is active on Google but not in our DB
              console.log(`[SUBSCRIPTION-CHECKER] 🔄 Activating subscription for user ${sub.user_id}`)
              
              const { error } = await supabase
                .from('user_subscriptions')
                .update({
                  status: 'active',
                  plan_name: 'premium',
                  expires_at: googleExpiresAt,
                  next_billing_date: googleExpiresAt,
                  auto_renew: googleData.autoRenewing,
                  payment_attempts: 0,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sub.id)
              
              if (!error) {
                googleSyncStats.activated++
                console.log(`[SUBSCRIPTION-CHECKER] ✅ Activated user ${sub.user_id} until ${googleExpiresAt}`)
              } else {
                googleSyncStats.errors++
              }
            } else if (expiryMismatch && isActiveOnGoogle) {
              // UPDATE: Expiry dates don't match
              console.log(`[SUBSCRIPTION-CHECKER] 📅 Updating expiry for user ${sub.user_id}`)
              
              const { error } = await supabase
                .from('user_subscriptions')
                .update({
                  expires_at: googleExpiresAt,
                  next_billing_date: googleExpiresAt,
                  auto_renew: googleData.autoRenewing,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sub.id)
              
              if (!error) {
                googleSyncStats.updated++
              } else {
                googleSyncStats.errors++
              }
            } else if (shouldBeExpired) {
              // EXPIRY: Google says expired but we have it as active
              console.log(`[SUBSCRIPTION-CHECKER] ⏰ Expiring subscription for user ${sub.user_id}`)
              
              const newStatus = sub.auto_renew ? 'payment_failed' : 'expired'
              const { error } = await supabase
                .from('user_subscriptions')
                .update({
                  status: newStatus,
                  plan_name: 'free',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sub.id)
              
              if (!error) {
                googleSyncStats.updated++
              } else {
                googleSyncStats.errors++
              }
            }
          } catch (err) {
            console.error(`[SUBSCRIPTION-CHECKER] Error syncing user ${sub.user_id}:`, err)
            googleSyncStats.errors++
          }
        }
      }
      
      console.log('[SUBSCRIPTION-CHECKER] Google sync complete:', googleSyncStats)
    }

    // ========== STEP 2B: Sync Apple App Store subscriptions ==========
    // This catches missed webhooks and ensures DB matches Apple's actual state
    let appleSyncStats = { checked: 0, activated: 0, updated: 0, errors: 0 }
    
    if (APPLE_SHARED_SECRET) {
      console.log('[SUBSCRIPTION-CHECKER] Syncing Apple App Store subscriptions...')
      
      // Get all Apple subscriptions that might need syncing
      // NOTE: We need the receipt data stored somewhere - for now we'll just check expiry dates
      // In the future, store the latest_receipt in the database for re-validation
      const { data: appleSubs } = await supabase
        .from('user_subscriptions')
        .select('id, user_id, provider_transaction_id, expires_at, status, plan_name, auto_renew')
        .eq('payment_method', 'apple')
        .in('status', ['active', 'cancelled', 'payment_pending', 'expired', 'payment_failed'])
      
      if (appleSubs && appleSubs.length > 0) {
        console.log(`[SUBSCRIPTION-CHECKER] Found ${appleSubs.length} Apple subscriptions to check`)
        appleSyncStats.checked = appleSubs.length
        
        // For Apple, we primarily rely on webhook notifications and expiry date checking
        // Full receipt validation requires storing receipts, which we can add later if needed
        for (const sub of appleSubs) {
          try {
            const dbExpiresAt = new Date(sub.expires_at).getTime()
            const now = Date.now()
            const isExpiredInDb = dbExpiresAt < now
            const isActiveInDb = sub.status === 'active'
            
            // Check for stuck subscriptions (expired but still active)
            if (isExpiredInDb && isActiveInDb) {
              console.log(`[SUBSCRIPTION-CHECKER] ⏰ Expiring Apple subscription for user ${sub.user_id}`)
              
              const newStatus = sub.auto_renew ? 'payment_failed' : 'expired'
              const { error } = await supabase
                .from('user_subscriptions')
                .update({
                  status: newStatus,
                  plan_name: 'free',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sub.id)
              
              if (!error) {
                appleSyncStats.updated++
              } else {
                appleSyncStats.errors++
              }
            }
          } catch (err) {
            console.error(`[SUBSCRIPTION-CHECKER] Error syncing Apple user ${sub.user_id}:`, err)
            appleSyncStats.errors++
          }
        }
      }
      
      console.log('[SUBSCRIPTION-CHECKER] Apple sync complete:', appleSyncStats)
    } else {
      console.log('[SUBSCRIPTION-CHECKER] Skipping Apple sync (no APPLE_SHARED_SECRET)')
    }

    // ========== STEP 2C: Sync Paystack subscriptions ==========
    // Check for Paystack subscriptions that might be stuck
    let paystackSyncStats = { checked: 0, activated: 0, updated: 0, errors: 0 }
    
    console.log('[SUBSCRIPTION-CHECKER] Syncing Paystack subscriptions...')
    
    // Get all Paystack subscriptions that might need syncing
    const { data: paystackSubs } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, provider_transaction_id, expires_at, status, plan_name, auto_renew, payment_attempts, cancellation_requested')
    if (paystackSubs && paystackSubs.length > 0) {
      console.log(`[SUBSCRIPTION-CHECKER] Found ${paystackSubs.length} Paystack subscriptions to check`)
      paystackSyncStats.checked = paystackSubs.length
      
      // For Paystack, check based on expiry dates and payment status
      // Paystack relies on webhook notifications and the recurring billing system
      for (const sub of paystackSubs) {
        try {
          const dbExpiresAt = new Date(sub.expires_at).getTime()
          const now = Date.now()
          const isExpiredInDb = dbExpiresAt < now
          const isActiveInDb = sub.status === 'active'
          const hasCancellationRequested = sub.cancellation_requested === true
          
          // Check for stuck subscriptions (expired but still active)
          // This includes both cancellation_requested=true and old status='cancelled'
          if (isExpiredInDb && isActiveInDb) {
            console.log(`[SUBSCRIPTION-CHECKER] ⏰ Expiring Paystack subscription for user ${sub.user_id}`)
            
            const newStatus = sub.auto_renew && !hasCancellationRequested ? 'payment_failed' : 'expired'
            const { error } = await supabase
              .from('user_subscriptions')
              .update({
                status: newStatus,
                plan_name: 'free',
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id)
            
            if (!error) {
              paystackSyncStats.updated++
            } else {
              paystackSyncStats.errors++
            }
          }
          
          // Check for old status='cancelled' that are also expired
          if (sub.status === 'cancelled' && isExpiredInDb) {
            console.log(`[SUBSCRIPTION-CHECKER] ⏰ Migrating old cancelled status for user ${sub.user_id}`)
            
            const { error } = await supabase
              .from('user_subscriptions')
              .update({
                status: 'expired',
                plan_name: 'free',
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id)
            
            if (!error) {
              paystackSyncStats.updated++
            } else {
              paystackSyncStats.errors++
            }
          }
          
          // Check for payment_pending that should be activated
          // (webhook might have been missed)
          if (sub.status === 'payment_pending' && !isExpiredInDb && sub.payment_attempts < 3) {
            console.log(`[SUBSCRIPTION-CHECKER] 🔄 Checking payment_pending for user ${sub.user_id}`)
            // For now, just log - in the future, could verify with Paystack API
          }
        } catch (err) {
          console.error(`[SUBSCRIPTION-CHECKER] Error syncing Paystack user ${sub.user_id}:`, err)
          paystackSyncStats.errors++
        }
      }
    }
    
    console.log('[SUBSCRIPTION-CHECKER] Paystack sync complete:', paystackSyncStats)

    // ========== STEP 3: Get stats of what was updated ==========
    const { data: expiredSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, plan_name, expires_at, payment_method')
      .in('status', ['expired', 'payment_failed'])
      .gte('updated_at', new Date(Date.now() - 5 * 60000).toISOString())
    
    const expiredCount = expiredSubscriptions?.length || 0
    console.log(`[SUBSCRIPTION-CHECKER] Processed ${expiredCount} expired/failed subscriptions in last 5 min`)

    // ========== STEP 4: Check for subscriptions expiring soon ==========
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
    
    // ========== STEP 5: Fix stuck subscriptions ==========
    const { data: stuckSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, plan_name, expires_at, payment_method, auto_renew')
      .eq('status', 'active')
      .eq('plan_name', 'premium')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
    
    let stuckFixed = 0
    if (stuckSubscriptions && stuckSubscriptions.length > 0) {
      console.warn(`[SUBSCRIPTION-CHECKER] WARNING: Found ${stuckSubscriptions.length} stuck subscriptions!`)
      
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
        
        if (!updateError) {
          stuckFixed++
          console.log(`[SUBSCRIPTION-CHECKER] Fixed stuck subscription ${sub.id} -> ${newStatus}`)
        }
      }
    }
    
    return json(200, {
      message: 'Subscription check completed',
      found_expired: needsProcessingCount,
      processed: expiredCount,
      expiring_soon: soonToExpireCount,
      stuck_fixed: stuckFixed,
      google_sync: googleSyncStats,
      apple_sync: appleSyncStats,
      paystack_sync: paystackSyncStats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[SUBSCRIPTION-CHECKER] Error:', error)
    return json(500, { error: 'Internal server error', details: String(error) })
  }
})
