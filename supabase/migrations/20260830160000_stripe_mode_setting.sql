-- Test/live toggle for Stripe, mirroring the existing paystack_mode row -
-- Edge Functions and the frontend both read this at runtime to decide which
-- of the TEST/LIVE key pair to use (see supabase/functions/_shared/stripe-utils.ts
-- and src/utils/getStripePublishableKey.ts).
INSERT INTO public.app_settings (id, value)
VALUES ('stripe_mode', '{"mode": "test"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
