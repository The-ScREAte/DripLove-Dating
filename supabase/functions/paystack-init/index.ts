// Supabase Edge Function: paystack-init
// Initializes Paystack transaction server-side using secret key and returns authorization_url/reference
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface InitRequest {
  email: string
  amount?: number // major units
  currency?: string
  plan?: string
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
    
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!secret) return json(500, { error: 'Missing PAYSTACK_SECRET_KEY' })

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { email, amount, currency, plan, channels, metadata, callback_url } = (await req.json()) as InitRequest
    if (!email) return json(400, { error: 'email required' })

    const payload: Record<string, unknown> = { email }
    let actualPlan = plan

    // If plan is provided, use it for subscription
    if (actualPlan) {
      payload.plan = actualPlan
      // Remove any other parameters that might conflict with subscription plans
      delete payload.channels
      delete payload.amount
      delete payload.currency
    } else {
      // For one-time or amount-based subscriptions
      if (!amount) return json(400, { error: 'amount required when no plan is provided' })
      payload.amount = Math.round(Number(amount) * 100)
      payload.currency = (currency || 'USD').toUpperCase()
      if (channels && channels.length) payload.channels = channels
    }

    if (metadata) payload.metadata = metadata
    // Include callback_url for both one-time and subscription payments
    if (callback_url) payload.callback_url = callback_url

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
