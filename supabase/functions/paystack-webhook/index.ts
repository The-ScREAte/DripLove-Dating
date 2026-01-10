// Supabase Edge Function: paystack-webhook
// Handles Paystack webhook events, saves authorization codes for recurring billing
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'
import { getPaystackSecretKey } from '../_shared/paystack-utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

async function verifyPaystackSignature(body: string, signature: string, secretKey: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secretKey),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    )
    
    const computedSignature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(body)
    )
    
    const computedHex = Array.from(new Uint8Array(computedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    return computedHex === signature
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

async function findUserByEmail(supabase: SupabaseClient, email: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single()
    
    if (error || !data) {
      console.log(`No user found for email: ${email}`)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error finding user:', error)
    return null
  }
}

function extractUserIdFromMetadata(eventData: unknown): string | null {
  const data = eventData as { metadata?: { custom_fields?: unknown } } | null
  const customFields = (data?.metadata as any)?.custom_fields
  if (!Array.isArray(customFields)) return null
  for (const f of customFields) {
    const field = f as { variable_name?: unknown; value?: unknown } | null
    const variableName = typeof field?.variable_name === 'string' ? field.variable_name : ''
    if (variableName === 'user_id' || variableName === 'driplove_user_id') {
      const val = field?.value
      if (typeof val === 'string' && val.length > 0) return val
    }
  }
  return null
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function extractCustomerEmail(eventData: unknown): string | null {
  const email = (eventData as { customer?: { email?: unknown } } | null)?.customer?.email
  return typeof email === 'string' && email.includes('@') ? email : null
}

function extractSubscriptionCode(eventData: unknown): string | null {
  const data = eventData as
    | {
        subscription_code?: unknown
        subscription?: { subscription_code?: unknown } | null
        data?: { subscription_code?: unknown } | null
      }
    | null

  const code =
    data?.subscription_code ||
    data?.subscription?.subscription_code ||
    data?.data?.subscription_code
  return typeof code === 'string' && code.length > 0 ? code : null
}

interface AuthorizationData {
  authorization_code?: string
  signature?: string
  reusable?: boolean
  brand?: string
  last4?: string
  exp_month?: string
  exp_year?: string
  bank?: string
  channel?: string
  card_type?: string
}

function extractAuthorization(eventData: unknown): AuthorizationData | null {
  const data = eventData as { authorization?: AuthorizationData } | null
  return data?.authorization || null
}

async function saveAuthorization(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  authorization: AuthorizationData,
  amount: number,
  currency: string
) {
  if (!authorization.authorization_code) {
    console.log('[PAYSTACK-WEBHOOK] No authorization_code in response')
    return
  }

  // Only save if reusable
  if (authorization.reusable === false) {
    console.log('[PAYSTACK-WEBHOOK] Authorization is not reusable, skipping save')
    return
  }

  console.log(`[PAYSTACK-WEBHOOK] Saving authorization for user ${userId}`)

  const { error } = await supabase
    .from('paystack_authorizations')
    .upsert({
      user_id: userId,
      email,
      authorization_code: authorization.authorization_code,
      signature: authorization.signature,
      reusable: authorization.reusable ?? true,
      brand: authorization.brand,
      last4: authorization.last4,
      exp_month: authorization.exp_month ? parseInt(authorization.exp_month) : null,
      exp_year: authorization.exp_year ? parseInt(authorization.exp_year) : null,
      bank: authorization.bank,
      channel: authorization.channel,
      card_type: authorization.card_type,
      default_amount: amount, // Store in smallest unit (kobo/pesewas)
      default_currency: currency,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,authorization_code',
    })

  if (error) {
    console.error('[PAYSTACK-WEBHOOK] Error saving authorization:', error)
  } else {
    console.log('[PAYSTACK-WEBHOOK] Authorization saved successfully')
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[PAYSTACK-WEBHOOK] Webhook received')
    
    // Verify signature
    const signature = req.headers.get('x-paystack-signature')
    const body = await req.text()

    // Get the appropriate Paystack secret key based on mode in database
    const PAYSTACK_SECRET_KEY = await getPaystackSecretKey()
    
    if (!signature || !await verifyPaystackSignature(body, signature, PAYSTACK_SECRET_KEY)) {
      console.log('[PAYSTACK-WEBHOOK] Invalid signature')
      return json(401, { error: 'Invalid signature' })
    }

    const event = JSON.parse(body)
    console.log('[PAYSTACK-WEBHOOK] Event type:', event.event)
    console.log('[PAYSTACK-WEBHOOK] Event data:', JSON.stringify(event.data, null, 2))
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: 'Missing Supabase env' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    const eventType = event.event
    const eventData = event.data as any

    // Cancellation-type events: disable authorization and update subscription
    if (eventType === 'subscription.disable' || eventType === 'subscription.not_renew') {
      console.log('[PAYSTACK-WEBHOOK] Processing subscription cancellation event')

      const email = extractCustomerEmail(eventData)
      if (!email) return json(400, { error: 'No customer email found' })

      const user = await findUserByEmail(supabase, email)
      if (!user) return json(404, { error: 'User not found' })

      // Disable all user's authorizations
      await supabase
        .from('paystack_authorizations')
        .update({ status: 'disabled', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)

      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update({
          auto_renew: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('payment_method', 'paystack')

      if (updateError) {
        console.error('[PAYSTACK-WEBHOOK] Error updating auto_renew:', updateError)
        return json(500, { error: 'Failed to update subscription cancellation' })
      }

      return json(200, { message: 'Cancellation processed' })
    }

    // Payment failures - retry logic
    if (eventType === 'charge.failed' || eventType === 'invoice.payment_failed') {
      console.log('[PAYSTACK-WEBHOOK] Processing payment failure event')

      const email = extractCustomerEmail(eventData)
      if (!email) return json(400, { error: 'No customer email found' })

      const user = await findUserByEmail(supabase, email)
      if (!user) return json(404, { error: 'User not found' })

      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('id, payment_attempts, status')
        .eq('user_id', user.id)
        .eq('payment_method', 'paystack')
        .eq('status', 'active')
        .single()

      if (!subscription) {
        console.log('[PAYSTACK-WEBHOOK] No active subscription found for user:', user.id)
        return json(404, { error: 'No active subscription found' })
      }

      const currentAttempts = subscription.payment_attempts || 0
      const newAttempts = currentAttempts + 1
      console.log(`[PAYSTACK-WEBHOOK] Payment failed for user ${user.id}, attempt ${newAttempts}/3`)

      await supabase
        .from('user_subscriptions')
        .update({
          payment_attempts: newAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('payment_method', 'paystack')

      if (newAttempts >= 3) {
        console.log(`[PAYSTACK-WEBHOOK] 3rd payment attempt failed for user ${user.id}, deactivating subscription`)

        // Disable authorizations
        await supabase
          .from('paystack_authorizations')
          .update({ status: 'disabled', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)

        const { error: failureError } = await supabase.rpc('handle_payment_failure', {
          p_user_id: user.id,
          p_reason: `Payment failed after ${newAttempts} attempts. Event: ${eventType}. Gateway response: ${eventData?.gateway_response || 'Unknown error'}`,
        })

        if (failureError) {
          console.error('[PAYSTACK-WEBHOOK] Error handling payment failure:', failureError)
          return json(500, { error: 'Failed to handle payment failure' })
        }
      }

      return json(200, { message: 'Failure processed' })
    }

    // Successful payment / renewal events
    if (eventType === 'charge.success' || eventType === 'subscription.create') {
      console.log('[PAYSTACK-WEBHOOK] Processing payment success/renewal event')

      const userIdFromMeta = extractUserIdFromMetadata(eventData)
      const email = extractCustomerEmail(eventData)

      let userId: string | null = userIdFromMeta
      let resolvedEmail: string | null = email

      if (!userId) {
        if (!email) return json(400, { error: 'No customer email found' })
        const user = await findUserByEmail(supabase, email)
        if (!user) return json(404, { error: 'User not found' })
        userId = user.id
        resolvedEmail = email
      }

      if (!userId) return json(400, { error: 'Unable to resolve user' })

      // Extract and save authorization for future recurring charges
      const authorization = extractAuthorization(eventData)
      const amount = eventData?.amount || 0 // Already in smallest unit
      const currency = eventData?.currency || 'GHS'

      if (authorization) {
        await saveAuthorization(supabase, userId, resolvedEmail || '', authorization, amount, currency)
      }

      // Get current expiry to extend from it if still active
      const { data: currentSub } = await supabase
        .from('user_subscriptions')
        .select('expires_at, provider_transaction_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextExpiry =
        currentSub?.expires_at && new Date(currentSub.expires_at) > new Date()
          ? addDays(new Date(currentSub.expires_at), 30)
          : addDays(new Date(), 30)
      const subscriptionCode = extractSubscriptionCode(eventData)

      const upsertPayload: Record<string, unknown> = {
        user_id: userId,
        status: 'active',
        plan_name: 'premium',
        payment_method: 'paystack',
        auto_renew: true,
        payment_attempts: 0,
        expires_at: nextExpiry.toISOString(),
        next_billing_date: nextExpiry.toISOString(),
        starts_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (subscriptionCode && currentSub?.provider_transaction_id !== subscriptionCode) {
        upsertPayload.provider_transaction_id = subscriptionCode
      }

      const { error: upsertError } = await supabase
        .from('user_subscriptions')
        .upsert(upsertPayload, { onConflict: 'user_id' })

      if (upsertError) {
        console.error('[PAYSTACK-WEBHOOK] Error upserting subscription:', upsertError)
        return json(500, { error: 'Failed to activate subscription' })
      }

      // Record payment (best-effort)
      let paymentRecordId: string | null = null
      try {
        const reference = eventData?.reference || subscriptionCode || ''
        const { data: paymentRecord, error: paymentError } = await supabase
          .from('subscription_payments')
          .insert({
            user_id: userId,
            amount: Number(amount) / 100,
            currency: currency || 'GHS',
            payment_method: 'paystack',
            transaction_id: reference,
          })
          .select('id')
          .single()
        
        if (!paymentError && paymentRecord) {
          paymentRecordId = paymentRecord.id
        }
      } catch (e) {
        console.error('[PAYSTACK-WEBHOOK] Error recording payment:', e)
      }

      // Process referral commission if payment was recorded
      if (paymentRecordId) {
        try {
          const { data: commissionResult, error: commissionError } = await supabase.rpc('process_referral_commission', {
            p_user_id: userId,
            p_payment_amount: Number(amount) / 100,
            p_payment_id: paymentRecordId
          })
          
          if (commissionError) {
            console.error('[PAYSTACK-WEBHOOK] Error processing commission:', commissionError)
          } else {
            console.log('[PAYSTACK-WEBHOOK] Commission result:', commissionResult)
          }
        } catch (commErr) {
          console.error('[PAYSTACK-WEBHOOK] Commission processing failed:', commErr)
        }
      }

      return json(200, { message: 'Success processed' })
    }

    console.log('[PAYSTACK-WEBHOOK] Unhandled event type:', eventType)
    return json(200, { message: 'Unhandled event ignored' })

  } catch (error) {
    console.error('[PAYSTACK-WEBHOOK] Error processing webhook:', error)
    return json(500, { error: 'Internal server error' })
  }
})
