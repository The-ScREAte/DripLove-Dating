-- Paystack recurring billing (authorization-code based, no plan codes)

-- 1) Internal secrets table (not exposed via RLS; used for cron->edge auth)
CREATE TABLE IF NOT EXISTS public.internal_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_secrets ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: no one can read/write via PostgREST.

-- Ensure we have a cron secret (generated server-side; not committed as plaintext)
INSERT INTO public.internal_secrets (key, value)
VALUES (
  'paystack_billing_cron_secret',
  encode(gen_random_bytes(32), 'hex')
)
ON CONFLICT (key) DO NOTHING;


-- 2) Saved Paystack authorization codes (used for recurring charges)
CREATE TABLE IF NOT EXISTS public.paystack_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,

  authorization_code text NOT NULL,
  signature text,
  reusable boolean,

  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  bank text,
  channel text,
  card_type text,

  -- Amount/currency to use for recurring charge_authorization (smallest unit)
  default_amount integer NOT NULL,
  default_currency text NOT NULL,

  status text NOT NULL DEFAULT 'active',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT paystack_authorizations_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS paystack_authorizations_user_auth_code_unique
  ON public.paystack_authorizations(user_id, authorization_code);

CREATE INDEX IF NOT EXISTS paystack_authorizations_user_status_idx
  ON public.paystack_authorizations(user_id, status);

ALTER TABLE public.paystack_authorizations ENABLE ROW LEVEL SECURITY;

-- Optional: allow users to see their own saved authorization status (no codes should be shown in UI)
-- NOTE: This policy allows SELECT of full rows; if you later expose this table directly to the client,
-- consider a view that omits authorization_code.
CREATE POLICY "Users can view own paystack auth" ON public.paystack_authorizations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- 3) Charge attempt audit log (helps debugging + idempotency)
CREATE TABLE IF NOT EXISTS public.paystack_charge_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,

  reference text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL,

  status text NOT NULL DEFAULT 'pending',
  gateway_response text,
  paystack_response jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT paystack_charge_attempts_status_check CHECK (status IN ('pending', 'success', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS paystack_charge_attempts_reference_unique
  ON public.paystack_charge_attempts(reference);

CREATE INDEX IF NOT EXISTS paystack_charge_attempts_user_idx
  ON public.paystack_charge_attempts(user_id, created_at DESC);

ALTER TABLE public.paystack_charge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own paystack charge attempts" ON public.paystack_charge_attempts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- 4) Schedule the recurring billing edge function (hourly)
-- Uses a secret stored in internal_secrets, so we don't embed secrets in the migration.
SELECT cron.schedule(
  'paystack-recurring-billing',
  '5 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://tgjsyyihabsovironesw.supabase.co/functions/v1/paystack-recurring-billing',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT value FROM public.internal_secrets WHERE key = 'paystack_billing_cron_secret')
        ),
        body:='{}'::jsonb
    ) as request_id;
  $$
);
