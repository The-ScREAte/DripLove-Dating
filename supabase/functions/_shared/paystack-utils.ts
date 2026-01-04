// Shared utility for Paystack Edge Functions
// Gets the appropriate Paystack secret key (test or live) based on app_settings

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export async function getPaystackSecretKey(): Promise<string> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase environment variables')
  }

  // Create a service role client to read app_settings
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  
  // Get the paystack_mode from app_settings
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('id', 'paystack_mode')
    .single()
  
  if (error || !data) {
    console.warn('Failed to fetch paystack_mode, defaulting to test')
    // Default to test for safety
    const testKey = Deno.env.get('PAYSTACK_SECRET_KEY_TEST')
    if (!testKey) throw new Error('Missing PAYSTACK_SECRET_KEY_TEST')
    return testKey
  }

  const mode = data.value?.mode || 'test'
  const key = mode === 'live' 
    ? Deno.env.get('PAYSTACK_SECRET_KEY_LIVE')
    : Deno.env.get('PAYSTACK_SECRET_KEY_TEST')
  
  if (!key) {
    throw new Error(`Missing PAYSTACK_SECRET_KEY_${mode.toUpperCase()}`)
  }

  console.log(`[Paystack] Using ${mode} mode`)
  return key
}

export async function getPaystackMode(): Promise<'test' | 'live'> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return 'test'
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('id', 'paystack_mode')
    .single()
  
  if (error || !data) {
    return 'test'
  }

  return data.value?.mode === 'live' ? 'live' : 'test'
}
