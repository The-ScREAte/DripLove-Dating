// Supabase Edge Function: apple-app-store-webhook
// Receives App Store Server Notifications V2 for subscription events and
// keeps user_subscriptions in sync with what Apple is actually doing -
// most importantly, extending expires_at on DID_RENEW so a subscriber who
// doesn't cancel during their free trial (or a paid period) stays premium
// once Apple auto-renews and charges them, instead of getting silently
// downgraded to free by get_current_subscription_status the moment the
// *original* expires_at passes.
//
// Docs: https://developer.apple.com/documentation/appstoreservernotifications
//
// IMPORTANT: Apple retired the old V1 notification format (plain JSON body
// with a `notification_type` field) years ago. What Apple actually POSTs
// today is V2: a single `{ "signedPayload": "<JWS>" }` body, where that JWS
// - and the nested signedTransactionInfo/signedRenewalInfo JWS strings
// inside it - are cryptographically signed and must be verified against
// Apple's real root certificate before being trusted. See
// ../_shared/apple-jws-verify.ts for that verification.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { verifyAppleSignedPayload } from '../_shared/apple-jws-verify.ts'

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

interface ResponseBodyV2DecodedPayload {
  notificationType: string
  subtype?: string
  notificationUUID?: string
  data?: {
    appAppleId?: number
    bundleId?: string
    environment?: 'Sandbox' | 'Production'
    signedTransactionInfo?: string
    signedRenewalInfo?: string
  }
}

interface JWSTransactionDecodedPayload {
  transactionId: string
  originalTransactionId: string
  productId: string
  purchaseDate?: number
  expiresDate?: number
  environment?: 'Sandbox' | 'Production'
  transactionReason?: 'PURCHASE' | 'RENEWAL'
}

interface JWSRenewalInfoDecodedPayload {
  originalTransactionId: string
  autoRenewProductId?: string
  autoRenewStatus?: number // 0 = off, 1 = on
}

// deno-lint-ignore no-explicit-any
async function recordPaymentAndCommission(
  supabase: any,
  userId: string,
  transactionId: string,
) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('country_code')
      .eq('id', userId)
      .single()

    const userCountry = (profile as { country_code?: string } | null)?.country_code || 'GH'

    const { data: paymentConfig } = await supabase
      .from('payment_config')
      .select('premium_price_monthly, currency, country_prices')
      .single()

    const config = paymentConfig as { premium_price_monthly?: number; currency?: string; country_prices?: unknown } | null
    let paymentAmount = config?.premium_price_monthly || 56
    let paymentCurrency = config?.currency || 'GHS'

    if (config?.country_prices && typeof config.country_prices === 'object') {
      const countryPrices = config.country_prices as Record<string, { price: number; currency: string }>
      if (countryPrices[userCountry]) {
        paymentAmount = countryPrices[userCountry].price
        paymentCurrency = countryPrices[userCountry].currency
      }
    }

    const { data: paymentRecord, error: paymentError } = await supabase
      .from('subscription_payments')
      .insert({
        user_id: userId,
        amount: paymentAmount,
        currency: paymentCurrency,
        payment_method: 'apple',
        transaction_id: `apple_${transactionId}`,
      })
      .select('id')
      .single()

    if (!paymentError && (paymentRecord as { id?: string } | null)?.id) {
      await supabase.rpc('process_referral_commission', {
        p_user_id: userId,
        p_payment_amount: paymentAmount,
        p_payment_id: (paymentRecord as { id: string }).id,
      })
    }
  } catch (err) {
    console.error('[APPLE-WEBHOOK] Payment/commission recording failed:', err)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[APPLE-WEBHOOK] 🍎 Received App Store Server Notification')

    const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '')
    const body = await req.json()

    const signedPayload = body?.signedPayload
    if (!signedPayload || typeof signedPayload !== 'string') {
      console.warn('[APPLE-WEBHOOK] No signedPayload in request body - not a valid V2 notification')
      return json(200, { message: 'No signedPayload, acknowledged' })
    }

    // 1) Verify + decode the outer notification envelope.
    let outer: ResponseBodyV2DecodedPayload
    try {
      outer = await verifyAppleSignedPayload<ResponseBodyV2DecodedPayload>(signedPayload)
    } catch (err) {
      console.error('[APPLE-WEBHOOK] ❌ signedPayload failed signature verification:', err)
      // Acknowledge with 200 anyway - Apple retries on non-2xx, and a forged
      // or malformed payload will never pass verification no matter how
      // many times it's retried. Returning an error status here would just
      // make Apple hammer this endpoint pointlessly.
      return json(200, { message: 'Signature verification failed, acknowledged' })
    }

    const notificationType = outer.notificationType
    const subtype = outer.subtype
    console.log('[APPLE-WEBHOOK] Notification type:', notificationType, 'subtype:', subtype)

    if (notificationType === 'TEST') {
      console.log('[APPLE-WEBHOOK] ✅ Test notification received and verified successfully')
      return json(200, { message: 'Test notification acknowledged' })
    }

    if (!outer.data?.signedTransactionInfo) {
      console.warn('[APPLE-WEBHOOK] No signedTransactionInfo in notification data')
      return json(200, { message: 'No transaction info' })
    }

    // 2) Verify + decode the nested transaction (and renewal, if present) info.
    // These are separately-signed JWS strings, not just base64 JSON, so they
    // go through the same real verification as the outer envelope.
    const transactionInfo = await verifyAppleSignedPayload<JWSTransactionDecodedPayload>(
      outer.data.signedTransactionInfo,
    )
    const renewalInfo = outer.data.signedRenewalInfo
      ? await verifyAppleSignedPayload<JWSRenewalInfoDecodedPayload>(outer.data.signedRenewalInfo)
      : null

    const originalTransactionId = transactionInfo.originalTransactionId
    const transactionId = transactionInfo.transactionId
    const productId = transactionInfo.productId
    const expiresDateMs = transactionInfo.expiresDate

    console.log('[APPLE-WEBHOOK] Transaction:', {
      originalTransactionId,
      transactionId,
      productId,
      expires: expiresDateMs ? new Date(expiresDateMs).toISOString() : 'none',
    })

    if (!originalTransactionId) {
      console.warn('[APPLE-WEBHOOK] No originalTransactionId in transaction info')
      return json(200, { message: 'No originalTransactionId' })
    }

    // 3) Find the user this subscription belongs to. originalTransactionId
    // is stable across every renewal of a given subscription (transactionId
    // changes each time) - matching only on the old transactionId is why the
    // previous (V1-format) webhook never found the right row on renewal.
    const { data: existingSub, error: findError } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .or(`original_transaction_id.eq.${originalTransactionId},provider_transaction_id.eq.${originalTransactionId}`)
      .maybeSingle()

    if (findError) {
      console.error('[APPLE-WEBHOOK] Error finding subscription:', findError)
      return json(200, { message: 'Lookup failed, acknowledged' })
    }

    const userId = existingSub?.user_id
    if (!userId) {
      console.warn('[APPLE-WEBHOOK] No user found for originalTransactionId:', originalTransactionId)
      return json(200, { message: 'No user found' })
    }

    switch (notificationType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW':
      case 'OFFER_REDEEMED': {
        console.log(`[APPLE-WEBHOOK] ✅ Activating/extending subscription for user ${userId}`)

        const expiresAt = expiresDateMs
          ? new Date(expiresDateMs)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        // SUBSCRIBED with subtype INITIAL_BUY is the very first purchase,
        // which the client already flagged as trial-or-not via
        // iap-receipt-validator right after purchase completed - don't
        // clobber that here. DID_RENEW (including the real post-trial
        // conversion) and OFFER_REDEEMED always represent a genuine charge,
        // so is_trial is cleared unconditionally for those.
        const isInitialBuy = notificationType === 'SUBSCRIBED' && subtype === 'INITIAL_BUY'

        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            plan_name: 'premium',
            status: 'active',
            expires_at: expiresAt.toISOString(),
            next_billing_date: expiresAt.toISOString(),
            provider_transaction_id: transactionId,
            original_transaction_id: originalTransactionId,
            auto_renew: renewalInfo?.autoRenewStatus !== 0,
            payment_method: 'apple',
            payment_attempts: 0,
            updated_at: new Date().toISOString(),
            ...(isInitialBuy ? {} : { is_trial: false }),
          })
          .eq('user_id', userId)

        if (updateError) {
          console.error('[APPLE-WEBHOOK] Error updating subscription:', updateError)
          return json(500, { error: 'Update failed' })
        }

        console.log(`[APPLE-WEBHOOK] ✅ Subscription active until ${expiresAt.toISOString()}`)

        // Record payment + commission for actual charges only - recording the
        // INITIAL_BUY transaction again here would double-commission it.
        if (!isInitialBuy) {
          await recordPaymentAndCommission(supabase, userId, transactionId)
        }

        return json(200, { message: 'Subscription activated', user_id: userId })
      }

      case 'DID_CHANGE_RENEWAL_STATUS': {
        const autoRenewOn = subtype === 'AUTO_RENEW_ENABLED' || renewalInfo?.autoRenewStatus === 1
        console.log(`[APPLE-WEBHOOK] ${autoRenewOn ? '🔄 Auto-renew re-enabled' : '⚠️ Auto-renew disabled (cancellation)'} for user ${userId}`)

        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            // Cancellation: stop auto-renew but keep access until expires_at
            // (the frontend and get_current_subscription_status both already
            // treat 'cancelled' as still-premium-until-expiry).
            status: autoRenewOn ? 'active' : 'cancelled',
            auto_renew: autoRenewOn,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)

        if (updateError) {
          console.error('[APPLE-WEBHOOK] Error updating renewal status:', updateError)
        }

        return json(200, { message: 'Renewal status updated', user_id: userId })
      }

      case 'DID_FAIL_TO_RENEW': {
        // Billing issue - Apple is retrying (possibly in a grace period).
        // Don't downgrade yet; wait for GRACE_PERIOD_EXPIRED or EXPIRED.
        console.log(`[APPLE-WEBHOOK] ⚠️ Renewal billing issue for user ${userId} (subtype: ${subtype})`)
        return json(200, { message: 'Renewal failure noted', user_id: userId })
      }

      case 'GRACE_PERIOD_EXPIRED':
      case 'EXPIRED': {
        console.log(`[APPLE-WEBHOOK] ❌ Subscription expired for user ${userId}`)
        await supabase.rpc('handle_subscription_expiry')
        return json(200, { message: 'Subscription expired', user_id: userId })
      }

      case 'REFUND':
      case 'REVOKE': {
        console.log(`[APPLE-WEBHOOK] 💰 Refund/revoke for user ${userId}`)

        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'refunded',
            plan_name: 'free',
            auto_renew: false,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)

        if (updateError) {
          console.error('[APPLE-WEBHOOK] Error processing refund:', updateError)
        }

        return json(200, { message: 'Refund processed', user_id: userId })
      }

      default:
        console.log(`[APPLE-WEBHOOK] Unhandled notification type: ${notificationType} (subtype: ${subtype})`)
        return json(200, { message: 'Notification acknowledged' })
    }
  } catch (err) {
    console.error('[APPLE-WEBHOOK] 💥 Error:', err)
    return json(500, { error: 'Internal error', details: String(err) })
  }
})
