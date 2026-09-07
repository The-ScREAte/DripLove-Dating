-- Closes a real cross-account abuse path: iap-receipt-validator and
-- google-iap-validator upsert premium onto user_subscriptions keyed only by
-- `user_id` (onConflict: 'user_id'), with NO check that the underlying
-- Apple/Google subscription (provider_transaction_id) isn't already granting
-- premium to a DIFFERENT user_id. Since a device's App Store/Google account
-- receipt is shared across every app account signed in on that device, this
-- meant: buy premium once, then log into any number of other DripLove
-- accounts on the same device and tap "Restore Purchases" (or even just
-- re-open the buy flow, which StoreKit will report as "already owned") to
-- unlock premium on each of them for free, off a single paid subscription.
--
-- Fixed with a DB-level trigger (not just an edge-function check) so the
-- rule holds regardless of which code path writes to user_subscriptions,
-- now or in the future: a given provider_transaction_id (Apple's stable
-- original_transaction_id when available, else the transaction/purchase
-- token) can be the active premium grant for at most one user_id at a time.
-- Renewing/restoring your OWN subscription is unaffected -- the check only
-- fires against a DIFFERENT user_id's still-entitled row.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS original_transaction_id text;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_original_transaction_id
  ON public.user_subscriptions (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_provider_transaction_id
  ON public.user_subscriptions (payment_method, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_shared_iap_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_conflict_user uuid;
BEGIN
  -- Only IAP-based grants of premium carry this risk (Paystack has its own
  -- per-user saved authorization codes, which can't be shared this way).
  IF NEW.plan_name = 'premium'
     AND NEW.payment_method IN ('apple', 'google')
     AND (NEW.provider_transaction_id IS NOT NULL OR NEW.original_transaction_id IS NOT NULL) THEN

    SELECT user_id INTO v_conflict_user
    FROM public.user_subscriptions
    WHERE payment_method = NEW.payment_method
      AND user_id <> NEW.user_id
      AND plan_name = 'premium'
      AND status IN ('active', 'cancelled')
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (NEW.provider_transaction_id IS NOT NULL AND provider_transaction_id = NEW.provider_transaction_id)
        OR (NEW.original_transaction_id IS NOT NULL AND original_transaction_id = NEW.original_transaction_id)
      )
    LIMIT 1;

    IF v_conflict_user IS NOT NULL THEN
      RAISE EXCEPTION 'IAP_SUBSCRIPTION_ALREADY_LINKED: this % subscription is already active on a different account', NEW.payment_method
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_shared_iap_subscription ON public.user_subscriptions;
CREATE TRIGGER trg_prevent_shared_iap_subscription
BEFORE INSERT OR UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_shared_iap_subscription();
