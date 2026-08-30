// Shared utility for Stripe Edge Functions - gets the appropriate Stripe
// secret key (test or live) based on app_settings, mirroring how
// paystack-utils.ts already does this for Paystack.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export async function getStripeMode(): Promise<'test' | 'live'> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return 'test'
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('id', 'stripe_mode')
    .single()

  if (error || !data) {
    return 'test'
  }

  return data.value?.mode === 'live' ? 'live' : 'test'
}

export async function getStripeSecretKey(): Promise<string> {
  const mode = await getStripeMode()
  const key = mode === 'live'
    ? Deno.env.get('STRIPE_SECRET_KEY_LIVE')
    : Deno.env.get('STRIPE_SECRET_KEY_TEST')

  if (!key) {
    throw new Error(`Stripe is not configured (missing STRIPE_SECRET_KEY_${mode.toUpperCase()} secret in Supabase)`)
  }

  console.log(`[Stripe] Using ${mode} mode`)
  return key
}
