// Supabase Edge Function: paystack-recurring-billing-run
// Admin-only manual trigger for Paystack recurring billing.
// Calls the cron-secured function internally without exposing secrets to the client.

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

type InternalSecretRow = { key: string; value: string }

type ProfileAdminRow = { is_admin: boolean }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { ok: false, error: 'Missing Supabase env' })
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single<ProfileAdminRow>()

    if (profileError || !profile?.is_admin) {
      return json(403, { ok: false, error: 'Forbidden' })
    }

    const { data: secretRow, error: secretError } = await supabase
      .from('internal_secrets')
      .select('key, value')
      .eq('key', 'paystack_billing_cron_secret')
      .maybeSingle<InternalSecretRow>()

    if (secretError || !secretRow?.value) {
      return json(500, { ok: false, error: 'Cron secret not configured' })
    }

    const forwardResp = await fetch(`${SUPABASE_URL}/functions/v1/paystack-recurring-billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': secretRow.value,
      },
      body: '{}',
    })

    const forwardJson = await forwardResp.json().catch(() => null)

    return json(forwardResp.status, {
      ok: forwardResp.ok,
      result: forwardJson,
    })
  } catch (err) {
    return json(500, { ok: false, error: 'Server error', details: (err as Error).message })
  }
})
