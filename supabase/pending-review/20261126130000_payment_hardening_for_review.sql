-- PAYMENT HARDENING - FOR REVIEW, NOT YET APPLIED.
-- Written by the payment/subscription audit. Read each section, then apply it
-- yourself (supabase db push, or paste into the SQL editor).
--
-- Companion code changes (edge functions must be DEPLOYED for them to take effect):
--   paystack-webhook, paystack-verify, paystack-init, paystack-recurring-billing,
--   deactivate-user-payments, cancel-subscription, reactivate-subscription,
--   subscription-checker, sync-google-subscriptions, google-play-webhook,
--   iap-receipt-validator, google-iap-validator, stripe-charge-campaign,
--   plus the new _shared/caller-auth.ts and _shared/payment-guards.ts.

-- ---------------------------------------------------------------------------
-- 1) A payment reference may only be recorded once.
--    The edge functions now dedupe in code (earliest row wins), but a unique
--    index makes it impossible for a race to double-extend a subscription.
--    Skipped with a NOTICE if duplicates already exist - clean those up first:
--      select transaction_id, count(*) from public.subscription_payments
--      where transaction_id is not null and transaction_id <> ''
--      group by 1 having count(*) > 1;
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.subscription_payments
    WHERE transaction_id IS NOT NULL AND transaction_id <> ''
    GROUP BY transaction_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'subscription_payments has duplicate transaction_id values - unique index NOT created. Resolve duplicates, then re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_transaction_id_key
      ON public.subscription_payments (transaction_id)
      WHERE transaction_id IS NOT NULL AND transaction_id <> '';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) handle_payment_failure downgrades a user to free. It is SECURITY DEFINER
--    and takes an arbitrary p_user_id, so while it was executable by every
--    logged-in user, any account could downgrade any other account. Only edge
--    functions (service_role) may call it; the client no longer does (src/iap.ts
--    used to call it after 3 network errors, which also downgraded real
--    subscribers on flaky connections).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_payment_failure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_payment_failure(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) OPTIONAL, run by hand: move the hourly subscription-checker cron job off the
--    public anon key. Until you do, subscription-checker still accepts the anon key
--    (ALLOW_LEGACY_ANON_CRON defaults to true) so nothing breaks on deploy.
--
--    a) create a secret (do not commit its value):
--         insert into public.internal_secrets (key, value)
--         values ('subscription_cron_secret', encode(gen_random_bytes(24), 'hex'))
--         on conflict (key) do update set value = excluded.value;
--    b) reschedule job 'subscription-checker-hourly' to send it:
--         select cron.unschedule('subscription-checker-hourly');
--         select cron.schedule('subscription-checker-hourly', '10 * * * *', $cron$
--           select net.http_post(
--             url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/subscription-checker',
--             headers := jsonb_build_object(
--               'Content-Type', 'application/json',
--               'x-cron-secret', (select value from public.internal_secrets where key = 'subscription_cron_secret')
--             ),
--             body := '{}'::jsonb,
--             timeout_milliseconds := 60000
--           );
--         $cron$);
--    c) then set the edge secret ALLOW_LEGACY_ANON_CRON=false.
-- ---------------------------------------------------------------------------
