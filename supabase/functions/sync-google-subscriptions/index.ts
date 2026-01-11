// Supabase Edge Function: sync-google-subscriptions
// Runs daily via cron to sync Google Play subscription status
// This ensures subscriptions stay active even if webhooks fail

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const GOOGLE_PACKAGE_NAME = Deno.env.get('GOOGLE_PACKAGE_NAME') || 'com.driplove.dating'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

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

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
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

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

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
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('🔄 [GOOGLE-SYNC] Starting daily subscription sync')
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    
    // Get all active Google Play subscriptions
    const { data: subscriptions, error: fetchError } = await supabase
      .from('user_subscriptions')
      .select('user_id, provider_transaction_id, expires_at, plan_name, status')
      .eq('payment_method', 'google')
      .in('status', ['active', 'payment_pending', 'cancelled'])
    
    if (fetchError) {
      console.error('[GOOGLE-SYNC] Error fetching subscriptions:', fetchError)
      return json(500, { error: 'Failed to fetch subscriptions' })
    }
    
    if (!subscriptions || subscriptions.length === 0) {
      console.log('[GOOGLE-SYNC] No Google subscriptions to sync')
      return json(200, { message: 'No subscriptions to sync', updated: 0 })
    }
    
    console.log(`[GOOGLE-SYNC] Found ${subscriptions.length} Google subscriptions to check`)
    
    // Get Google Play access token
    const accessToken = await getAndroidPublisherAccessToken()
    
    let updated = 0
    let expired = 0
    let errors = 0
    
    // Check each subscription with Google Play API
    for (const sub of subscriptions) {
      try {
        const purchaseToken = sub.provider_transaction_id
        
        if (!purchaseToken) {
          console.warn(`[GOOGLE-SYNC] No purchase token for user ${sub.user_id}`)
          continue
        }
        
        // Try both subscription IDs
        const subscriptionIds = ['premium_monthly', 'monthly']
        let googleData: any = null
        
        for (const subscriptionId of subscriptionIds) {
          const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}`
          
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          
          if (response.ok) {
            googleData = await response.json()
            break
          }
        }
        
        if (!googleData) {
          console.warn(`[GOOGLE-SYNC] Could not verify subscription for user ${sub.user_id}`)
          errors++
          continue
        }
        
        const expiryTimeMillis = Number(googleData.expiryTimeMillis)
        const startTimeMillis = Number(googleData.startTimeMillis)
        const autoRenewing = googleData.autoRenewing === true
        
        if (!Number.isFinite(expiryTimeMillis)) {
          console.warn(`[GOOGLE-SYNC] Invalid expiry time for user ${sub.user_id}`)
          errors++
          continue
        }
        
        const expiresAt = new Date(expiryTimeMillis).toISOString()
        const startsAt = Number.isFinite(startTimeMillis) 
          ? new Date(startTimeMillis).toISOString() 
          : sub.starts_at || new Date().toISOString()
        
        const isActive = expiryTimeMillis > Date.now()
        
        // Update database if status changed
        const dbExpiresAt = new Date(sub.expires_at).getTime()
        const needsUpdate = Math.abs(dbExpiresAt - expiryTimeMillis) > 60000 || // More than 1 minute difference
                           (isActive && sub.status !== 'active') ||
                           (!isActive && sub.status === 'active')
        
        if (needsUpdate) {
          const newStatus = isActive ? 'active' : 'expired'
          const newPlanName = isActive ? 'premium' : 'free'
          
          const { error: updateError } = await supabase
            .from('user_subscriptions')
            .update({
              status: newStatus,
              plan_name: newPlanName,
              expires_at: expiresAt,
              starts_at: startsAt,
              next_billing_date: isActive ? expiresAt : null,
              auto_renew: autoRenewing,
              payment_attempts: isActive ? 0 : sub.payment_attempts || 0,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', sub.user_id)
            .eq('payment_method', 'google')
          
          if (updateError) {
            console.error(`[GOOGLE-SYNC] Error updating user ${sub.user_id}:`, updateError)
            errors++
          } else {
            if (isActive) {
              updated++
              console.log(`[GOOGLE-SYNC] ✅ Updated user ${sub.user_id}: active until ${expiresAt}`)
            } else {
              expired++
              console.log(`[GOOGLE-SYNC] ⏰ Expired user ${sub.user_id}`)
            }
          }
        } else {
          console.log(`[GOOGLE-SYNC] ℹ️ User ${sub.user_id}: no changes needed`)
        }
        
      } catch (error) {
        console.error(`[GOOGLE-SYNC] Error checking user ${sub.user_id}:`, error)
        errors++
      }
    }
    
    console.log(`[GOOGLE-SYNC] ✅ Sync complete: ${updated} updated, ${expired} expired, ${errors} errors`)
    
    return json(200, {
      success: true,
      message: 'Subscription sync complete',
      total: subscriptions.length,
      updated,
      expired,
      errors,
    })
    
  } catch (error) {
    console.error('💥 [GOOGLE-SYNC] Fatal error:', error)
    return json(500, { error: 'Internal server error', details: String(error) })
  }
})
