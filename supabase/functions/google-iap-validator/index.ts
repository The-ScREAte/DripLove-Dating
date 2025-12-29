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
    throw new Error(`Failed to get Google OAuth token: ${tokenResponse.status} ${JSON.stringify(tokenData)}`)
  }

  return tokenData.access_token
}

async function getAndroidPublisherAccessToken(): Promise<string> {
  const base64Json =
    Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT') ||
    Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64') ||
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ||
    Deno.env.get('FCM_CREDENTIALS')

  if (!base64Json) {
    throw new Error('Missing service account secret. Set GOOGLE_PLAY_SERVICE_ACCOUNT (base64 JSON).')
  }

  const serviceAccountJson = atob(base64Json)
  const serviceAccount = JSON.parse(serviceAccountJson)
  return await generateAccessToken(serviceAccount, 'https://www.googleapis.com/auth/androidpublisher')
}

function candidateSubscriptionIds(productId: string): string[] {
  const raw = (productId || '').trim()
  const candidates: string[] = []

  if (raw) candidates.push(raw)

  // Legacy mapping (some clients may still send the fully-qualified string)
  if (raw === 'com.driplove.dating.premium.monthly') candidates.push('premium_monthly')

  // Dedupe while preserving order
  return Array.from(new Set(candidates))
}

serve(async (req: Request) => {
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
    const { productId, purchaseToken, transactionId } = await req.json()
    
    console.log('🧾 [GOOGLE-IAP-VALIDATOR] Validating purchase:', {
      productId,
      hasPurchaseToken: !!purchaseToken,
      hasTransactionId: !!transactionId,
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

    if (!purchaseToken || typeof purchaseToken !== 'string') {
      return json(400, { valid: false, error: 'Missing purchaseToken' })
    }

    // 3️⃣ Verify with Google Play Developer API
    const packageName = Deno.env.get('GOOGLE_PACKAGE_NAME') || 'com.driplove.dating'
    const subscriptionIds = candidateSubscriptionIds(productId)

    console.log('🔐 [GOOGLE-IAP-VALIDATOR] Fetching Android Publisher access token')
    const accessToken = await getAndroidPublisherAccessToken()

    let googleJson: any = null
    let lastError: { status: number; body: any; subscriptionId: string } | null = null

    for (const subscriptionId of subscriptionIds) {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}`
      console.log('🌐 [GOOGLE-IAP-VALIDATOR] Calling Google API:', { packageName, subscriptionId })

      const googleResp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const body = await googleResp.json().catch(() => null)

      if (googleResp.ok) {
        googleJson = body
        lastError = null
        break
      }

      console.warn('⚠️ [GOOGLE-IAP-VALIDATOR] Google API attempt failed:', {
        subscriptionId,
        status: googleResp.status,
      })
      lastError = { status: googleResp.status, body, subscriptionId }
    }

    if (!googleJson) {
      console.error('❌ [GOOGLE-IAP-VALIDATOR] Google API error:', lastError)
      return json(200, {
        valid: false,
        active: false,
        error: 'Google verification failed',
        details: lastError,
      })
    }

    const expiryTimeMillis = Number(googleJson?.expiryTimeMillis)
    const startTimeMillis = Number(googleJson?.startTimeMillis)

    if (!Number.isFinite(expiryTimeMillis)) {
      console.error('❌ [GOOGLE-IAP-VALIDATOR] Missing expiryTimeMillis:', googleJson)
      return json(200, { valid: false, active: false, error: 'Invalid Google response' })
    }

    const now = Date.now()
    const isActive = expiryTimeMillis > now
    const expiresAt = new Date(expiryTimeMillis).toISOString()
    const startsAt = Number.isFinite(startTimeMillis) ? new Date(startTimeMillis).toISOString() : new Date().toISOString()
    const autoRenew = typeof googleJson?.autoRenewing === 'boolean' ? googleJson.autoRenewing : true

    if (!isActive) {
      console.log('ℹ️ [GOOGLE-IAP-VALIDATOR] Subscription not active per Google:', { expiresAt })
      return json(200, {
        valid: true,
        active: false,
        expiresDate: expiresAt,
        expires_at: expiresAt,
        transaction_id: transactionId || purchaseToken,
      })
    }

    // 4️⃣ IDEMPOTENCY CHECK: Check if this purchase token was already processed
    const { data: existingSub } = await supabaseClient
      .from('user_subscriptions')
      .select('id, flutterwave_transaction_id, expires_at')
      .eq('user_id', userData.user.id)
      .eq('flutterwave_transaction_id', purchaseToken)
      .single()

    if (existingSub && new Date(existingSub.expires_at) >= new Date(expiresAt)) {
      console.log('ℹ️ [GOOGLE-IAP-VALIDATOR] Purchase already processed, skipping update')
      return json(200, {
        valid: true,
        active: true,
        expiresDate: existingSub.expires_at,
        expires_at: existingSub.expires_at,
        transaction_id: transactionId || purchaseToken,
        purchaseToken,
        already_processed: true,
      })
    }

    // 5️⃣ Update Supabase subscription ONLY after Google confirms active
    const { error: upsertError } = await supabaseClient
      .from('user_subscriptions')
      .upsert({
        user_id: userData.user.id,
        plan_name: 'premium',
        status: 'active',
        starts_at: startsAt,
        expires_at: expiresAt,
        next_billing_date: expiresAt,
        flutterwave_transaction_id: purchaseToken,
        auto_renew: autoRenew,
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
      expiresDate: expiresAt,
      expires_at: expiresAt,
      transaction_id: transactionId || purchaseToken,
      purchaseToken,
    })

  } catch (err) {
    console.error('💥 [GOOGLE-IAP-VALIDATOR] Error:', err)
    return json(500, { error: 'Internal server error' })
  }
})
