/**
 * Single client-side definition of premium entitlement. Mirrors the database
 * function get_current_subscription_status
 * (20260926230000_add_grace_period_to_subscription_expiry_check.sql) - keep the
 * two in sync.
 *
 * - A renewal webhook can land a few minutes after `expires_at`, so access
 *   continues for a short grace period past it.
 * - `cancelled` still has access until `expires_at`.
 * - `payment_pending` is written only by the Google Play / App Store webhooks
 *   when a renewal charge failed and the store is retrying (expires_at is the
 *   store's real grace-period end). It never means "awaiting first payment",
 *   so it cannot grant premium to someone who hasn't paid.
 */
export const SUBSCRIPTION_GRACE_PERIOD_MS = 30 * 60 * 1000;

export interface EntitlementInput {
  plan_name?: string | null;
  status?: string | null;
  expires_at?: string | null;
}

/** True when `expiresAt` is set and already past the grace period. */
export const isPastGracePeriod = (expiresAt: string | null | undefined): boolean =>
  !!expiresAt && new Date(expiresAt).getTime() <= Date.now() - SUBSCRIPTION_GRACE_PERIOD_MS;

/** Premium plan, entitled status, and not past expires_at (plus grace). */
export const isEntitledToPremium = (sub: EntitlementInput | null | undefined): boolean => {
  if (!sub) return false;
  const entitledByStatus =
    sub.status === 'active' || sub.status === 'cancelled' || sub.status === 'payment_pending';
  return sub.plan_name === 'premium' && entitledByStatus && !isPastGracePeriod(sub.expires_at);
};
