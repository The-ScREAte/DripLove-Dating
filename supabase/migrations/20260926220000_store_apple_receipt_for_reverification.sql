-- subscription-checker's hourly Apple reconciliation has been dead code:
-- it defines validateAppleReceipt() but never calls it, because there was
-- nowhere to get a receipt to re-validate - Apple's legacy verifyReceipt
-- endpoint needs the original base64 receipt blob, and we never stored it.
-- Without real re-verification, any Apple user whose renewal webhook is
-- ever missed gets demoted to payment_failed by handle_subscription_expiry
-- and never recovers automatically.
--
-- This column lets iap-receipt-validator persist the receipt it already
-- has on every purchase/renewal it processes, so subscription-checker can
-- actually re-validate it later instead of just re-reading our own stale
-- expires_at.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS latest_receipt_data text;

COMMENT ON COLUMN public.user_subscriptions.latest_receipt_data IS
  'Apple only: the base64 App Store receipt from the most recent successful iap-receipt-validator call, re-sent to Apple''s verifyReceipt endpoint by subscription-checker to confirm a subscription is still active when the DID_RENEW webhook was missed.';
