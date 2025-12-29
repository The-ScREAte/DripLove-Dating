// Supabase Edge Function: paystack-recurring-billing
// Runs on a schedule (pg_cron -> pg_net) to auto-renew Paystack subscriptions
// by charging saved authorization codes via Paystack charge_authorization.
//
// Security model:
// - verify_jwt = false (called by cron)
// - Requires header x-cron-secret matching value in public.internal_secrets

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

type InternalSecretRow = { key: string; value: string }

type SubscriptionRow = {
  id: string
  user_id: string
  expires_at: string | null
  next_billing_date: string | null
  status: string
  plan_name: string
  auto_renew: boolean
  payment_method: string
  payment_attempts: number | null
}

type PaystackAuthorizationRow = {
  id: string
  user_id: string
  email: string | null
  authorization_code: string
  status: 'active' | 'disabled'
  default_amount: number
  default_currency: string
}

interface PaystackChargeAuthorizationResponse {
  status: boolean
  message: string
  data?: {
    status?: string
    reference?: string
    gateway_response?: string
  }
}

async function chargeAuthorization(params: {
  email: string
  authorizationCode: string
  amount: number
  currency: string
  reference: string
  metadata: Record<string, unknown>
}) {
  const resp = await fetch('https://api.paystack.co/transaction/charge_authorization', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      authorization_code: params.authorizationCode,
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      metadata: params.metadata,
    }),
  })

  const jsonBody = (await resp.json()) as PaystackChargeAuthorizationResponse
  return { ok: resp.ok, body: jsonBody }
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const cronSecretHeader = (req.headers.get('x-cron-secret') || '').trim()
    const { data: secretRow, error: secretError } = await supabase
      .from('internal_secrets')
      .select('key, value')
      .eq('key', 'paystack_billing_cron_secret')
      .maybeSingle<InternalSecretRow>()

    if (secretError || !secretRow?.value) {
      console.error('[PAYSTACK-RECURRING] Missing cron secret row:', secretError)
      return json(500, { ok: false, error: 'Cron secret not configured' })
    }

    if (!cronSecretHeader || cronSecretHeader !== secretRow.value) {
      return json(401, { ok: false, error: 'Unauthorized' })
    }

    const nowIso = new Date().toISOString()

    const { data: dueSubs, error: dueError } = await supabase
      .from('user_subscriptions')
      .select(
        'id, user_id, expires_at, next_billing_date, status, plan_name, auto_renew, payment_method, payment_attempts'
      )
      .eq('payment_method', 'paystack')
      .eq('auto_renew', true)
      .eq('status', 'active')
      .eq('plan_name', 'premium')
      .not('next_billing_date', 'is', null)
      .lte('next_billing_date', nowIso)
      .limit(200)

    if (dueError) {
      console.error('[PAYSTACK-RECURRING] Failed to query due subs:', dueError)
      return json(500, { ok: false, error: 'Failed to query due subscriptions' })
    }

    const subscriptions = (dueSubs || []) as SubscriptionRow[]

    let processed = 0
    let charged = 0
    let failed = 0
    let skippedNoAuth = 0

    for (const sub of subscriptions) {
      processed += 1

      // If user cancelled locally but row is still active, respect auto_renew flag.
      if (!sub.auto_renew) continue

      const { data: authRow, error: authError } = await supabase
        .from('paystack_authorizations')
        .select('id, user_id, email, authorization_code, status, default_amount, default_currency')
        .eq('user_id', sub.user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<PaystackAuthorizationRow>()

      if (authError) {
        console.error('[PAYSTACK-RECURRING] Auth lookup error:', authError)
        skippedNoAuth += 1
        continue
      }
      if (!authRow?.authorization_code || !authRow.email) {
        skippedNoAuth += 1
        continue
      }

      const amount = authRow.default_amount
      const currency = authRow.default_currency

      if (!Number.isFinite(amount) || amount <= 0 || !currency) {
        skippedNoAuth += 1
        continue
      }

      const reference = `dl_ps_${sub.id}_${Date.now()}`

      // Insert attempt row first for idempotency/audit
      const { error: attemptInsertError } = await supabase
        .from('paystack_charge_attempts')
        .insert([
          {
            user_id: sub.user_id,
            subscription_id: sub.id,
            reference,
            amount,
            currency,
            status: 'pending',
            updated_at: new Date().toISOString(),
          },
        ])

      if (attemptInsertError) {
        console.error('[PAYSTACK-RECURRING] Failed to insert attempt:', attemptInsertError)
        failed += 1
        continue
      }

      const chargeResult = await chargeAuthorization({
        email: authRow.email,
        authorizationCode: authRow.authorization_code,
        amount,
        currency,
        reference,
        metadata: {
          source: 'driplove-cron',
          subscription_id: sub.id,
          user_id: sub.user_id,
        },
      })

      const paystackStatus = (chargeResult.body?.data?.status || '').toLowerCase()
      const gatewayResponse = chargeResult.body?.data?.gateway_response || chargeResult.body?.message

      if (chargeResult.ok && chargeResult.body?.status && paystackStatus === 'success') {
        charged += 1

        const currentExpiry = sub.expires_at ? new Date(sub.expires_at) : null
        const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date()
        const nextExpiry = addDays(base, 30)

        const { error: subUpdateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'active',
            plan_name: 'premium',
            payment_method: 'paystack',
            auto_renew: true,
            payment_attempts: 0,
            expires_at: nextExpiry.toISOString(),
            next_billing_date: nextExpiry.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id)

        if (subUpdateError) {
          console.error('[PAYSTACK-RECURRING] Failed to update subscription:', subUpdateError)
        }

        await supabase
          .from('paystack_charge_attempts')
          .update({
            status: 'success',
            gateway_response: gatewayResponse || null,
            paystack_response: chargeResult.body as unknown,
            updated_at: new Date().toISOString(),
          })
          .eq('reference', reference)

        continue
      }

      // Failure path
      failed += 1

      await supabase
        .from('paystack_charge_attempts')
        .update({
          status: 'failed',
          gateway_response: gatewayResponse || null,
          paystack_response: chargeResult.body as unknown,
          updated_at: new Date().toISOString(),
        })
        .eq('reference', reference)

      const currentAttempts = sub.payment_attempts || 0
      const newAttempts = currentAttempts + 1

      await supabase
        .from('user_subscriptions')
        .update({
          payment_attempts: newAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)

      if (newAttempts >= 3) {
        console.warn(
          `[PAYSTACK-RECURRING] Payment failed 3 times for user ${sub.user_id}; downgrading.`
        )

        await supabase.rpc('handle_payment_failure', {
          p_user_id: sub.user_id,
          p_reason: `Recurring Paystack charge_authorization failed after ${newAttempts} attempts. Gateway: ${gatewayResponse || 'unknown'}`,
        })

        // Safety: stop further charges.
        await supabase
          .from('user_subscriptions')
          .update({ auto_renew: false, updated_at: new Date().toISOString() })
          .eq('id', sub.id)

        await supabase
          .from('paystack_authorizations')
          .update({ status: 'disabled', updated_at: new Date().toISOString() })
          .eq('user_id', sub.user_id)
          .eq('status', 'active')
      }
    }

    return json(200, {
      ok: true,
      processed,
      charged,
      failed,
      skipped_no_auth: skippedNoAuth,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[PAYSTACK-RECURRING] Error:', err)
    return json(500, { ok: false, error: 'Server error', details: (err as Error).message })
  }
})
