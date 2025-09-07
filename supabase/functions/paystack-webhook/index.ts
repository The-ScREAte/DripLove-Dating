// Supabase Edge Function: paystack-webhook
// Handles Paystack webhook events, especially payment failures and subscription updates
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

async function verifyPaystackSignature(body: string, signature: string): Promise<boolean> {
  try {
    if (!PAYSTACK_SECRET_KEY) return false
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(PAYSTACK_SECRET_KEY),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    )
    
    const computedSignature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(body)
    )
    
    const computedHex = Array.from(new Uint8Array(computedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    return computedHex === signature
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

async function findUserByEmail(supabase: any, email: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single()
    
    if (error || !data) {
      console.log(`No user found for email: ${email}`)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error finding user:', error)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[PAYSTACK-WEBHOOK] Webhook received')
    
    // Verify signature
    const signature = req.headers.get('x-paystack-signature')
    const body = await req.text()
    
    if (!signature || !await verifyPaystackSignature(body, signature)) {
      console.log('[PAYSTACK-WEBHOOK] Invalid signature')
      return json(401, { error: 'Invalid signature' })
    }

    const event = JSON.parse(body)
    console.log('[PAYSTACK-WEBHOOK] Event type:', event.event)
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    switch (event.event) {
      case 'subscription.disable':
      case 'subscription.not_renew':
      case 'charge.failed':
      case 'invoice.payment_failed': {
        console.log('[PAYSTACK-WEBHOOK] Processing payment failure event')
        
        const customer = event.data.customer
        if (!customer?.email) {
          console.log('[PAYSTACK-WEBHOOK] No customer email found')
          return json(400, { error: 'No customer email found' })
        }

        // Find user by email
        const user = await findUserByEmail(supabase, customer.email)
        if (!user) {
          console.log('[PAYSTACK-WEBHOOK] User not found for email:', customer.email)
          return json(404, { error: 'User not found' })
        }

        // Handle payment failure
        const { error: failureError } = await supabase.rpc('handle_payment_failure', {
          p_user_id: user.id,
          p_reason: `Paystack webhook: ${event.event}`
        })

        if (failureError) {
          console.error('[PAYSTACK-WEBHOOK] Error handling payment failure:', failureError)
          return json(500, { error: 'Failed to handle payment failure' })
        }

        console.log('[PAYSTACK-WEBHOOK] Successfully handled payment failure for user:', user.id)
        break
      }

      case 'subscription.create':
      case 'charge.success':
      case 'invoice.create':
      case 'invoice.update': {
        console.log('[PAYSTACK-WEBHOOK] Processing payment success event')
        
        const customer = event.data.customer
        if (!customer?.email) {
          console.log('[PAYSTACK-WEBHOOK] No customer email found')
          return json(400, { error: 'No customer email found' })
        }

        // Find user by email
        const user = await findUserByEmail(supabase, customer.email)
        if (!user) {
          console.log('[PAYSTACK-WEBHOOK] User not found for email:', customer.email)
          return json(404, { error: 'User not found' })
        }

        // Update subscription to active if it was previously failed
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'active',
            plan_name: 'premium',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .in('status', ['payment_failed', 'expired'])

        if (updateError) {
          console.error('[PAYSTACK-WEBHOOK] Error updating subscription:', updateError)
        } else {
          console.log('[PAYSTACK-WEBHOOK] Successfully reactivated subscription for user:', user.id)
        }
        break
      }
      
      default:
        console.log('[PAYSTACK-WEBHOOK] Unhandled event type:', event.event)
    }

    return json(200, { message: 'Webhook processed successfully' })
  } catch (error) {
    console.error('[PAYSTACK-WEBHOOK] Error processing webhook:', error)
    return json(500, { error: 'Internal server error' })
  }
})