-- Remove Paystack plan-code configuration.
-- The app uses authorization-code recurring charges (charge_authorization) + cron only.

ALTER TABLE public.payment_config
DROP COLUMN IF EXISTS paystack_plan_code;
