// Supabase Edge Function: admin-billing-trigger
// Admin-only endpoint to manually trigger the recurring billing process
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  console.log('[ADMIN-BILLING-TRIGGER] Request received')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(401, { error: 'No authorization header' })
    }

    // Verify the user is an admin
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: authData, error: authError } = await anonClient.auth.getUser()
    if (authError || !authData?.user) {
      console.log('[ADMIN-BILLING-TRIGGER] Auth failed:', authError)
      return json(401, { error: 'Unauthorized' })
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_admin')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      console.log('[ADMIN-BILLING-TRIGGER] Not an admin:', authData.user.id)
      return json(403, { error: 'Admin access required' })
    }

    console.log('[ADMIN-BILLING-TRIGGER] Admin verified, fetching cron secret')

    // Get the cron secret from internal_secrets
    const { data: secretRow, error: secretError } = await serviceClient
      .from('internal_secrets')
      .select('value')
      .eq('key', 'paystack_billing_cron_secret')
      .single()

    if (secretError || !secretRow?.value) {
      console.error('[ADMIN-BILLING-TRIGGER] Failed to get cron secret:', secretError)
      return json(500, { error: 'Failed to get billing secret' })
    }

    console.log('[ADMIN-BILLING-TRIGGER] Calling paystack-recurring-billing')

    // Call the recurring billing function with the cron secret
    const billingResponse = await fetch(`${SUPABASE_URL}/functions/v1/paystack-recurring-billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': secretRow.value,
      },
      body: JSON.stringify({}),
    })

    const billingResult = await billingResponse.json()
    console.log('[ADMIN-BILLING-TRIGGER] Billing result:', billingResult)

    if (!billingResponse.ok) {
      return json(billingResponse.status, {
        error: 'Billing run failed',
        details: billingResult,
      })
    }

    return json(200, {
      success: true,
      ...billingResult,
    })
  } catch (error) {
    console.error('[ADMIN-BILLING-TRIGGER] Error:', error)
    return json(500, { error: 'Server error', details: (error as Error).message })
  }
})
