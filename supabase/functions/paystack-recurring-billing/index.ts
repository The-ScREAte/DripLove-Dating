// Supabase Edge Function: paystack-recurring-billing
// Processes recurring charges for subscriptions using saved authorization codes
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function generateReference(): string {
  return `RC_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  console.log('[PAYSTACK-RECURRING] Starting recurring billing run')

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Verify cron secret
    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret) {
      const { data: secretRow, error: secretError } = await supabase
        .from('internal_secrets')
        .select('value')
        .eq('key', 'paystack_billing_cron_secret')
        .single()

      if (secretError || !secretRow || secretRow.value !== cronSecret) {
        console.log('[PAYSTACK-RECURRING] Invalid cron secret')
        return json(401, { error: 'Invalid cron secret' })
      }
    } else {
      // If no cron secret, require admin JWT
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return json(401, { error: 'No authorization' })
      }

      const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })

      const { data: authData, error: authError } = await anonClient.auth.getUser()
      if (authError || !authData?.user) {
        return json(401, { error: 'Unauthorized' })
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', authData.user.id)
        .single()

      if (!profile?.is_admin) {
        return json(403, { error: 'Admin access required' })
      }
    }

    // Find all active subscriptions due for renewal (next_billing_date <= now)
    const now = new Date().toISOString()
    
    const { data: dueSubscriptions, error: subError } = await supabase
      .from('user_subscriptions')
      .select(`
        id,
        user_id,
        plan_name,
        status,
        auto_renew,
        next_billing_date,
        payment_attempts
      `)
      .eq('status', 'active')
      .eq('auto_renew', true)
      .eq('payment_method', 'paystack')
      .eq('plan_name', 'premium')
      .not('next_billing_date', 'is', null)
      .lte('next_billing_date', now)

    if (subError) {
      console.error('[PAYSTACK-RECURRING] Error fetching subscriptions:', subError)
      return json(500, { error: 'Failed to fetch subscriptions' })
    }

    console.log(`[PAYSTACK-RECURRING] Found ${dueSubscriptions?.length || 0} subscriptions due for renewal`)

    if (!dueSubscriptions || dueSubscriptions.length === 0) {
      return json(200, { 
        message: 'No subscriptions due',
        processed: 0,
        charged: 0,
        failed: 0
      })
    }

    let processed = 0
    let charged = 0
    let failed = 0

    for (const sub of dueSubscriptions) {
      processed++
      console.log(`[PAYSTACK-RECURRING] Processing subscription for user ${sub.user_id}`)

      // Get the user's active authorization
      const { data: authData } = await supabase
        .from('paystack_authorizations')
        .select('*')
        .eq('user_id', sub.user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!authData) {
        console.log(`[PAYSTACK-RECURRING] No active authorization for user ${sub.user_id}`)
        failed++
        continue
      }

      // Get user email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', sub.user_id)
        .single()

      if (!profile?.email) {
        console.log(`[PAYSTACK-RECURRING] No email for user ${sub.user_id}`)
        failed++
        continue
      }

      const reference = generateReference()

      // Create charge attempt record
      const { error: attemptError } = await supabase
        .from('paystack_charge_attempts')
        .insert({
          user_id: sub.user_id,
          subscription_id: sub.id,
          reference,
          amount: authData.default_amount,
          currency: authData.default_currency,
          status: 'pending',
        })

      if (attemptError) {
        console.error(`[PAYSTACK-RECURRING] Failed to create charge attempt:`, attemptError)
        failed++
        continue
      }

      // Charge using Paystack charge_authorization API
      try {
        const chargeResponse = await fetch('https://api.paystack.co/transaction/charge_authorization', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authorization_code: authData.authorization_code,
            email: profile.email,
            amount: authData.default_amount, // Already in smallest unit (kobo/pesewas)
            currency: authData.default_currency,
            reference,
          }),
        })

        const chargeData = await chargeResponse.json()
        console.log(`[PAYSTACK-RECURRING] Charge response for ${sub.user_id}:`, chargeData)

        if (chargeData.status && chargeData.data?.status === 'success') {
          // Payment successful - extend subscription
          const nextExpiry = new Date()
          nextExpiry.setDate(nextExpiry.getDate() + 30)

          await supabase
            .from('user_subscriptions')
            .update({
              expires_at: nextExpiry.toISOString(),
              next_billing_date: nextExpiry.toISOString(),
              payment_attempts: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id)

          await supabase
            .from('paystack_charge_attempts')
            .update({
              status: 'success',
              gateway_response: chargeData.data?.gateway_response || 'Success',
              paystack_response: chargeData,
              updated_at: new Date().toISOString(),
            })
            .eq('reference', reference)

          // Record payment
          await supabase
            .from('subscription_payments')
            .insert({
              user_id: sub.user_id,
              subscription_id: sub.id,
              amount: authData.default_amount / 100, // Convert back to major units
              currency: authData.default_currency,
              payment_method: 'paystack',
              transaction_id: reference,
            })

          charged++
          console.log(`[PAYSTACK-RECURRING] Successfully charged user ${sub.user_id}`)
        } else {
          // Payment failed
          const currentAttempts = (sub.payment_attempts || 0) + 1

          await supabase
            .from('user_subscriptions')
            .update({
              payment_attempts: currentAttempts,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id)

          await supabase
            .from('paystack_charge_attempts')
            .update({
              status: 'failed',
              gateway_response: chargeData.data?.gateway_response || chargeData.message || 'Failed',
              paystack_response: chargeData,
              updated_at: new Date().toISOString(),
            })
            .eq('reference', reference)

          // If 3+ failed attempts, cancel subscription
          if (currentAttempts >= 3) {
            console.log(`[PAYSTACK-RECURRING] 3 failed attempts for user ${sub.user_id}, cancelling`)
            await supabase.rpc('handle_payment_failure', {
              p_user_id: sub.user_id,
              p_reason: `Recurring charge failed after ${currentAttempts} attempts: ${chargeData.message || 'Unknown error'}`,
            })

            // Disable the authorization
            await supabase
              .from('paystack_authorizations')
              .update({ status: 'disabled', updated_at: new Date().toISOString() })
              .eq('id', authData.id)
          }

          failed++
          console.log(`[PAYSTACK-RECURRING] Charge failed for user ${sub.user_id}: ${chargeData.message}`)
        }
      } catch (chargeError) {
        console.error(`[PAYSTACK-RECURRING] Exception charging user ${sub.user_id}:`, chargeError)
        
        await supabase
          .from('paystack_charge_attempts')
          .update({
            status: 'failed',
            gateway_response: (chargeError as Error).message,
            updated_at: new Date().toISOString(),
          })
          .eq('reference', reference)

        failed++
      }
    }

    console.log(`[PAYSTACK-RECURRING] Billing run complete: processed=${processed}, charged=${charged}, failed=${failed}`)

    return json(200, {
      message: 'Billing run complete',
      processed,
      charged,
      failed,
    })
  } catch (error) {
    console.error('[PAYSTACK-RECURRING] Fatal error:', error)
    return json(500, { error: 'Server error', details: (error as Error).message })
  }
})
