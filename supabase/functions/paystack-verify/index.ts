// Supabase Edge Function: paystack-verify
// Verifies a Paystack transaction server-side, saves authorization for recurring billing, and activates premium

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { getPaystackSecretKey } from '../_shared/paystack-utils.ts'

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

type PaymentType = 'subscription' | 'one-time'

interface VerifyRequest {
  reference: string
  payment_type?: PaymentType
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

interface PaystackVerifyResponse {
  status: boolean
  message: string
  data?: {
    status?: string
    reference?: string
    amount?: number
    currency?: string
    customer?: { email?: string }
    authorization?: AuthorizationData
  }
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { ok: false, error: 'Missing Supabase env' })
    }

    // Get the appropriate secret key based on mode in database
    const PAYSTACK_SECRET_KEY = await getPaystackSecretKey()

    const authHeader = req.headers.get('Authorization') || ''

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      return json(401, { ok: false, error: 'Unauthorized' })
    }

    const user = authData.user

    const body = (await req.json()) as VerifyRequest
    const reference = (body?.reference || '').trim()
    const paymentType: PaymentType = body?.payment_type === 'one-time' ? 'one-time' : 'subscription'

    if (!reference) {
      return json(400, { ok: false, error: 'reference required' })
    }

    console.log(`[PAYSTACK-VERIFY] Verifying reference ${reference} for user ${user.id}`)

    const verifyResp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const verifyJson = (await verifyResp.json()) as PaystackVerifyResponse

    if (!verifyResp.ok || !verifyJson.status) {
      return json(400, {
        ok: false,
        verified: false,
        error: verifyJson.message || 'Paystack verify failed',
        details: verifyJson,
      })
    }

    const paystackData = verifyJson.data
    const txStatus = (paystackData?.status || '').toLowerCase()
    if (txStatus !== 'success') {
      return json(400, { ok: false, verified: false, error: `Transaction not successful: ${txStatus || 'unknown'}` })
    }

    // Basic anti-abuse: ensure the Paystack customer email matches the logged-in user email
    const paystackEmail = (paystackData?.customer?.email || '').trim().toLowerCase()
    const userEmail = (user.email || '').trim().toLowerCase()
    if (paystackEmail && userEmail && paystackEmail !== userEmail) {
      return json(403, { ok: false, verified: false, error: 'Reference does not belong to this user' })
    }

    // Save authorization for recurring billing (if available and reusable)
    const authorization = paystackData?.authorization
    if (authorization?.authorization_code && authorization.reusable !== false) {
      console.log(`[PAYSTACK-VERIFY] Saving authorization for user ${user.id}`)
      
      const amount = paystackData?.amount || 0 // Already in smallest unit
      const currency = paystackData?.currency || 'GHS'

      const { error: authSaveError } = await supabase
        .from('paystack_authorizations')
        .upsert({
          user_id: user.id,
          email: userEmail,
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
          default_amount: amount,
          default_currency: currency,
          status: 'active',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,authorization_code',
        })

      if (authSaveError) {
        console.error('[PAYSTACK-VERIFY] Error saving authorization:', authSaveError)
        // Don't fail the whole request, just log the error
      } else {
        console.log('[PAYSTACK-VERIFY] Authorization saved successfully')
      }
    }

    const expiry = addDays(new Date(), 30)

    // Find existing subscription row
    const { data: existing } = await supabase
      .from('user_subscriptions')
      .select('id, provider_transaction_id, payment_method')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const updateBase: Record<string, unknown> = {
      plan_name: 'premium',
      status: 'active',
      payment_method: 'paystack',
      expires_at: expiry.toISOString(),
      next_billing_date: paymentType === 'one-time' ? null : expiry.toISOString(),
      auto_renew: paymentType !== 'one-time',
      payment_attempts: 0,
      updated_at: new Date().toISOString(),
    }

    // Store the transaction reference if we don't already have a value
    if (!existing?.provider_transaction_id) {
      updateBase.provider_transaction_id = reference
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update(updateBase)
        .eq('id', existing.id)

      if (updateError) {
        return json(500, { ok: false, error: 'Failed to update subscription', details: updateError.message })
      }
    } else {
      const insertPayload = {
        user_id: user.id,
        starts_at: new Date().toISOString(),
        ...updateBase,
      }

      const { error: insertError } = await supabase.from('user_subscriptions').insert([insertPayload])
      if (insertError) {
        return json(500, { ok: false, error: 'Failed to create subscription', details: insertError.message })
      }
    }

    // Record the payment
    const { error: paymentError } = await supabase
      .from('subscription_payments')
      .insert({
        user_id: user.id,
        amount: (paystackData?.amount || 0) / 100, // Convert back to major units
        currency: paystackData?.currency || 'GHS',
        payment_method: 'paystack',
        transaction_id: reference,
      })

    if (paymentError) {
      console.error('[PAYSTACK-VERIFY] Error recording payment:', paymentError)
      // Don't fail, subscription is already activated
    }

    console.log(`[PAYSTACK-VERIFY] Successfully verified and activated premium for user ${user.id}`)

    return json(200, {
      ok: true,
      verified: true,
      reference,
      payment_type: paymentType,
    })
  } catch (err) {
    console.error('[PAYSTACK-VERIFY] Error:', err)
    return json(500, { ok: false, error: 'Server error', details: (err as Error).message })
  }
})
