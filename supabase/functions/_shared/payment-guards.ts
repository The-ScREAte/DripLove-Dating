// Shared payment guards for the Paystack edge functions.
//
// 1. claimPaymentReference: a payment reference may extend a subscription only
//    ONCE, no matter how many paths see it (paystack-verify called repeatedly,
//    Paystack webhook retries, charge.success + recurring-billing for the same
//    renewal charge). The first path to claim wins; the others skip the
//    extension. Works without a unique index (earliest row wins) and also
//    tolerates one (23505 = already claimed).
// 2. getMinimumPremiumAmountGhs / isAcceptableGhsPayment: paystack-init lets the
//    client pick the amount, so a successful charge must never be treated as a
//    premium purchase unless the amount is plausibly the real price.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export interface PaymentClaimInput {
  user_id: string
  amount: number // major units
  currency: string
  payment_method: string
  transaction_id: string
  subscription_id?: string | null
}

export interface PaymentClaim {
  /** true => this caller is the first to see the reference and may extend premium. */
  claimed: boolean
  paymentId: string | null
}

export async function claimPaymentReference(
  supabase: SupabaseClient,
  input: PaymentClaimInput,
): Promise<PaymentClaim> {
  const reference = (input.transaction_id || '').trim()
  // No reference => nothing to dedupe on; treat as claimed (legacy behaviour).
  if (!reference) return { claimed: true, paymentId: null }

  const row: Record<string, unknown> = {
    user_id: input.user_id,
    amount: input.amount,
    currency: input.currency,
    payment_method: input.payment_method,
    transaction_id: reference,
  }
  if (input.subscription_id) row.subscription_id = input.subscription_id

  const { data: inserted, error } = await supabase
    .from('subscription_payments')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    // Unique violation: someone else already claimed this reference.
    if ((error as { code?: string }).code === '23505') return { claimed: false, paymentId: null }
    // Any other DB error: do not silently grant; surface as not claimed so the
    // caller returns a retryable error rather than double-granting.
    console.error('[payment-guards] claim insert failed:', error)
    throw new Error('Failed to record payment')
  }

  const myId = (inserted as { id: string }).id

  // Without a unique index two concurrent paths can both insert. The earliest
  // row (by created_at, then id) is the winner; the loser removes its row.
  const { data: rows } = await supabase
    .from('subscription_payments')
    .select('id, created_at')
    .eq('transaction_id', reference)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(2)

  const winnerId = (rows as { id: string }[] | null)?.[0]?.id
  if (winnerId && winnerId !== myId) {
    await supabase.from('subscription_payments').delete().eq('id', myId)
    return { claimed: false, paymentId: null }
  }

  return { claimed: true, paymentId: myId }
}

/**
 * Lowest GHS amount that can be a genuine premium purchase. Derived from the
 * admin-configured USD price (payment_config.default_international_price) times
 * a conservative GHS-per-USD floor, with an absolute env floor as a backstop.
 * Deliberately far below the real converted price so legitimate payments are
 * never rejected, but cheap "pay 1 pesewa, get premium" abuse is.
 */
export async function getMinimumPremiumAmountGhs(supabase: SupabaseClient): Promise<number> {
  const envFloor = Number(Deno.env.get('PAYSTACK_MIN_AMOUNT_GHS') ?? '5')
  const fxFloor = Number(Deno.env.get('PAYSTACK_MIN_GHS_PER_USD') ?? '3')
  let usdPrice = 0
  try {
    const { data } = await supabase
      .from('payment_config')
      .select('default_international_price, default_international_currency')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const price = Number((data as { default_international_price?: unknown } | null)?.default_international_price)
    const cur = String((data as { default_international_currency?: unknown } | null)?.default_international_currency ?? 'USD').toUpperCase()
    if (Number.isFinite(price) && price > 0 && cur === 'USD') usdPrice = price
  } catch (e) {
    console.warn('[payment-guards] could not read payment_config:', e)
  }
  return computeMinimumGhs(usdPrice, envFloor, fxFloor)
}

/** Pure: floor = max(absolute env floor, usdPrice * GHS-per-USD floor), rounded to pesewas. */
export function computeMinimumGhs(usdPrice: number, envFloor: number, fxFloor: number): number {
  const floor = Math.max(
    Number.isFinite(envFloor) ? envFloor : 5,
    (Number.isFinite(usdPrice) ? usdPrice : 0) * (Number.isFinite(fxFloor) ? fxFloor : 3),
  )
  return Math.round(floor * 100) / 100
}

/** Pure: is this charge plausibly a premium purchase? */
export function evaluateGhsPayment(
  amountMajor: number,
  currency: string,
  min: number,
): { ok: boolean; min: number; reason?: string } {
  if ((currency || '').toUpperCase() !== 'GHS') return { ok: false, min, reason: `Unsupported currency ${currency}` }
  if (!Number.isFinite(amountMajor) || amountMajor < min) {
    return { ok: false, min, reason: `Amount ${amountMajor} below minimum ${min}` }
  }
  return { ok: true, min }
}

/** Paystack premium payments are GHS-only; anything else or below the floor is not a premium purchase. */
export async function isAcceptableGhsPayment(
  supabase: SupabaseClient,
  amountMajor: number,
  currency: string,
): Promise<{ ok: boolean; min: number; reason?: string }> {
  const min = await getMinimumPremiumAmountGhs(supabase)
  return evaluateGhsPayment(amountMajor, currency, min)
}
