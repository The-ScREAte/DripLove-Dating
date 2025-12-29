// Supabase Edge Function: paystack-verify
// Verifies a Paystack transaction server-side and activates premium only after verification.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')

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

interface PaystackVerifyResponse {
  status: boolean
  message: string
  data?: {
    status?: string
    reference?: string
    amount?: number
    currency?: string
    customer?: { email?: string }
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
    if (!PAYSTACK_SECRET_KEY) {
      return json(500, { ok: false, error: 'Missing PAYSTACK_SECRET_KEY' })
    }

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

    // Basic anti-abuse: ensure the Paystack customer email matches the logged-in user email.
    // (If Paystack didn’t return an email, we skip this check.)
    const paystackEmail = (paystackData?.customer?.email || '').trim().toLowerCase()
    const userEmail = (user.email || '').trim().toLowerCase()
    if (paystackEmail && userEmail && paystackEmail !== userEmail) {
      return json(403, { ok: false, verified: false, error: 'Reference does not belong to this user' })
    }

    const expiry = addDays(new Date(), 30)

    // Find existing subscription row (any method). We’ll update it, but only mark payment_method=paystack here.
    const { data: existing } = await supabase
      .from('user_subscriptions')
      .select('id, flutterwave_transaction_id, payment_method')
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

    // Only store the transaction reference if we don’t already have a value.
    // For true subscriptions, the webhook may later replace this with subscription_code for cancellation.
    if (!existing?.flutterwave_transaction_id) {
      updateBase.flutterwave_transaction_id = reference
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

    return json(200, {
      ok: true,
      verified: true,
      reference,
      payment_type: paymentType,
    })
  } catch (err) {
    return json(500, { ok: false, error: 'Server error', details: (err as Error).message })
  }
})
