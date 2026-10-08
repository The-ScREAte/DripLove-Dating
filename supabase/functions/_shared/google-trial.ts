// Google Play free trials: cancelling during the trial ends Premium immediately
// (DripLove policy, stated on the Android paywall), instead of at the end of the
// trial as Google does by default. Apple trials keep the standard behaviour.
//
// Detected from Google's own data, never our is_trial flag (which can be stale):
// purchases.subscriptions.get reports paymentState 2 while the subscription is
// still in its free trial, and autoRenewing false once the user has cancelled.

export interface GoogleTrialState {
  paymentState?: number | null
  autoRenewing?: boolean | null
}

export const isCancelledFreeTrial = (google: GoogleTrialState | null | undefined): boolean =>
  !!google && google.paymentState === 2 && google.autoRenewing === false

/** Ends the subscription at Google right away (nothing to refund during a free trial). */
export async function revokeGoogleSubscription(
  accessToken: string,
  packageName: string,
  subscriptionId: string,
  purchaseToken: string,
): Promise<boolean> {
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}:revoke`
  try {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) {
      console.error(`[GOOGLE-TRIAL] Revoke failed: ${response.status} ${await response.text()}`)
    }
    return response.ok
  } catch (err) {
    console.error('[GOOGLE-TRIAL] Revoke threw:', err)
    return false
  }
}

/** user_subscriptions fields for a free trial that was cancelled: Premium off now. */
export const cancelledTrialFields = () => {
  const now = new Date().toISOString()
  return {
    plan_name: 'free',
    status: 'expired',
    auto_renew: false,
    is_trial: false,
    expires_at: now,
    next_billing_date: null,
    updated_at: now,
  }
}
