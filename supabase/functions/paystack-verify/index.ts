// Supabase Edge Function: paystack-verify
// Verifies a Paystack transaction (one-time or subscription) using the reference
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

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

    const { reference } = await req.json()
    if (!reference) return json(400, { error: 'reference required' })

    const url = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    })

    const data = await res.json()
    if (!res.ok || !data?.status) {
      return json(res.status || 400, { ok: false, error: data?.message || 'Verification failed', details: data })
    }

    return json(200, { ok: true, data: data.data })
  } catch (err) {
    return json(500, { ok: false, error: (err as Error).message })
  }
})
