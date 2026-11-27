// Supabase Edge Function: paystack-init
// Initializes Paystack transaction server-side using secret key and returns authorization_url/reference
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { getPaystackSecretKey } from '../_shared/paystack-utils.ts'
import { getAuthedCaller } from '../_shared/caller-auth.ts'
import { isAcceptableGhsPayment } from '../_shared/payment-guards.ts'

interface InitRequest {
  email: string
  amount?: number // major units
  currency?: string
  channels?: string[]
  metadata?: Record<string, unknown>
  callback_url?: string
}

interface PaystackInitResponse {
  status: boolean
  message: string
  data?: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

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

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
    
    // Only a logged-in user may start a payment, and the user id stamped into
    // the transaction comes from their verified session - never from the body.
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: 'Server misconfigured' })
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const caller = await getAuthedCaller(req, admin)
    if (!caller) return json(401, { error: 'Please sign in to continue' })

    // Get the appropriate secret key based on mode in database
    const secret = await getPaystackSecretKey()

    const body = (await req.json()) as Record<string, unknown>
    const { email: bodyEmail, amount, currency, channels, metadata, callback_url } = body as unknown as InitRequest
    const email = caller.email || bodyEmail
    if (!email) return json(400, { error: 'email required' })

    // We do not support Paystack plan subscriptions in this app.
    // Recurring charges are handled exclusively via saved authorization codes + cron.
    if ('plan' in body && body.plan) {
      return json(400, { error: 'Paystack plan subscriptions are disabled. Use amount-based initialization.' })
    }

    const payload: Record<string, unknown> = { email }

    if (!amount) return json(400, { error: 'amount required' })
    const amountMajor = Number(amount)
    const payCurrency = (currency || 'GHS').toUpperCase()
    // Premium is sold in GHS at (roughly) the configured price. Reject anything
    // that could not be a premium purchase so a 1-pesewa payment never gets this far.
    const amountCheck = await isAcceptableGhsPayment(admin, amountMajor, payCurrency)
    if (!amountCheck.ok) {
      return json(400, { error: `Invalid payment amount. ${amountCheck.reason ?? ''}`.trim() })
    }
    const maxAmount = Number(Deno.env.get('PAYSTACK_MAX_AMOUNT_GHS') ?? '5000')
    if (Number.isFinite(maxAmount) && amountMajor > maxAmount) {
      return json(400, { error: 'Invalid payment amount' })
    }
    payload.amount = Math.round(amountMajor * 100)
    payload.currency = payCurrency
    if (channels && channels.length) payload.channels = channels

    // Keep client metadata (display/tracking fields) but drop any client-supplied
    // user id and stamp the real one from the session.
    const clientMeta = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
    const clientFields = Array.isArray(clientMeta.custom_fields) ? (clientMeta.custom_fields as Array<Record<string, unknown>>) : []
    const keptFields = clientFields.filter((f) => {
      const name = typeof f?.variable_name === 'string' ? f.variable_name : ''
      return name !== 'user_id' && name !== 'driplove_user_id'
    })
    payload.metadata = {
      ...clientMeta,
      user_id: caller.id,
      custom_fields: [...keptFields, { display_name: 'User ID', variable_name: 'user_id', value: caller.id }],
    }
    // Include callback_url for both one-time and subscription payments, but only
    // for our own hosts (an attacker-supplied URL would turn Paystack's post-payment
    // redirect into a phishing/open-redirect vector).
    if (callback_url) {
      let host = ''
      try { host = new URL(callback_url).hostname.toLowerCase() } catch { /* invalid */ }
      const extra = (Deno.env.get('PAYSTACK_CALLBACK_HOSTS') ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
      const supaHost = (() => { try { return new URL(SUPABASE_URL).hostname.toLowerCase() } catch { return '' } })()
      const allowed =
        host === 'localhost' || host === '127.0.0.1' ||
        host === 'driplove.love' || host.endsWith('.driplove.love') ||
        (supaHost && host === supaHost) || host.endsWith('.supabase.co') ||
        extra.includes(host)
      if (!allowed) return json(400, { error: 'Invalid callback URL' })
      payload.callback_url = callback_url
    }

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = (await res.json()) as PaystackInitResponse
    if (!res.ok || !data.status) {
      return json(res.status || 400, { error: data.message || 'Init failed', details: data })
    }

    return json(200, { ok: true, ...data.data })
  } catch (err) {
    return json(500, { error: 'Server error', details: (err as Error).message })
  }
})
