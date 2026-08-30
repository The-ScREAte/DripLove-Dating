-- Lets a regular user create and manage their own ads from Profile >
-- Advertisement, scoped to just their own rows. Admins keep the existing
-- "Admins can manage ads" FOR ALL policy untouched, so nothing about the
-- admin panel changes.

ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Denormalized onto each ad row (copied from advertiser_profiles at submit
-- time) so the admin panel can show/group by "who submitted this" without a
-- join, and so it stays a record of who it was even if that advertiser's
-- profile changes later.
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS contact_phone_country text;

CREATE INDEX IF NOT EXISTS idx_ads_created_by ON public.ads(created_by);
CREATE INDEX IF NOT EXISTS idx_ads_business_name ON public.ads(business_name);

-- One-time advertiser onboarding: business + contact info, plus the pricing
-- terms acceptance, reviewed by an admin before the user is allowed to
-- actually submit ads (see the updated ads INSERT policy below).
CREATE TABLE IF NOT EXISTS public.advertiser_profiles (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  contact_phone_country text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  -- Card is collected (via Stripe SetupIntent, never touching our own
  -- servers) right after business info during onboarding, so it's on file
  -- before an admin approves the advertiser. Nothing is charged yet - actual
  -- subscription billing (ad price x days live) happens later, when the
  -- advertiser creates an ad. Only Stripe's own non-sensitive identifiers are
  -- stored here; the raw card number/CVC never touches this database.
  stripe_customer_id text,
  stripe_payment_method_id text,
  card_brand text,
  card_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.advertiser_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own advertiser profile" ON public.advertiser_profiles;
CREATE POLICY "Users can view their own advertiser profile"
ON public.advertiser_profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

-- A payment method must already be attached before the row can even be
-- created - the onboarding form collects the card as part of the same
-- submission, so this just enforces server-side that a bare application
-- with no card on file can never be inserted.
DROP POLICY IF EXISTS "Users can create their own advertiser profile" ON public.advertiser_profiles;
CREATE POLICY "Users can create their own advertiser profile"
ON public.advertiser_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id AND status = 'pending' AND stripe_payment_method_id IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage advertiser profiles" ON public.advertiser_profiles;
CREATE POLICY "Admins can manage advertiser profiles"
ON public.advertiser_profiles FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- A user-submitted ad must start inactive (pending admin approval) - enforced
-- server-side regardless of what the client sends, since it's shown to every
-- user of the app and letting anyone self-publish unmoderated content there
-- (spam, scam links, inappropriate media) would be a real abuse vector. An
-- admin approving it is literally them using the existing Resume action in
-- the admin panel.
DROP POLICY IF EXISTS "Users can create their own ads" ON public.ads;
DROP POLICY IF EXISTS "Approved advertisers can create their own ads" ON public.ads;
CREATE POLICY "Approved advertisers can create their own ads"
ON public.ads
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND is_active = false
  AND EXISTS (
    SELECT 1 FROM public.advertiser_profiles
    WHERE id = auth.uid() AND status = 'approved'
  )
);

DROP POLICY IF EXISTS "Users can update their own ads" ON public.ads;
CREATE POLICY "Users can update their own ads"
ON public.ads
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete their own ads" ON public.ads;
CREATE POLICY "Users can delete their own ads"
ON public.ads
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);

-- Belt-and-suspenders on top of the INSERT check above: an UPDATE's WITH
-- CHECK can't diff old vs new per-column, so without this a user could still
-- slip is_active back to true through an edit of their own ad. This trigger
-- forces is_active back to whatever it already was whenever the actor isn't
-- an admin, so only an admin's own Pause/Resume action can actually change
-- it, on both insert and update paths.
CREATE OR REPLACE FUNCTION public.enforce_ads_admin_only_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.is_active := OLD.is_active;
    ELSE
      NEW.is_active := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_ads_admin_only_activation ON public.ads;
CREATE TRIGGER trigger_enforce_ads_admin_only_activation
BEFORE INSERT OR UPDATE ON public.ads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ads_admin_only_activation();
