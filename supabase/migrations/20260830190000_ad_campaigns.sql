-- Ad campaigns: budget/duration/audience/placement, on top of the existing
-- ad content fields. Advertisers set these in a second step after the ad's
-- content (title/media/link) - see AdCampaignStep.tsx. Admin still has to
-- approve the ad content (existing is_active gate, untouched), and campaign
-- billing is a single upfront charge for the full budget at "Launch
-- Campaign" (see stripe-charge-campaign edge function) - not metered daily.

ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS budget_per_day numeric;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS duration_days integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS total_budget numeric;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'standard' CHECK (placement IN ('standard', 'featured', 'premium'));
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS target_age_min integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS target_age_max integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS target_genders text[] NOT NULL DEFAULT '{}';
-- Impression band the estimate promised at launch - once delivered
-- impressions reach the top of this band, the ad stops being served (see the
-- useDiscoverAds query filter), so it never runs past what its budget paid
-- for.
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS estimated_impressions_min integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS estimated_impressions_max integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS campaign_started_at timestamptz;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS campaign_ends_at timestamptz;

-- Admin-configurable "impressions per $1" rate, per country - what the
-- estimate shown to advertisers is actually computed from. Mirrors the
-- stripe_mode / paystack_mode app_settings pattern already in use.
INSERT INTO public.app_settings (id, value)
VALUES ('ad_rates', '{"default": 1000, "GH": 1500, "NG": 1300, "US": 700, "GB": 800, "CA": 750, "KE": 1400, "ZA": 900, "UG": 1500, "TZ": 1500, "RW": 1500}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Campaign dates are set once, the moment an admin actually approves the ad
-- (flips is_active true) - not at creation time, since content review can
-- take a while and the advertiser shouldn't be burning campaign days while
-- waiting on that.
CREATE OR REPLACE FUNCTION public.set_campaign_dates_on_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true AND OLD.is_active = false AND NEW.campaign_started_at IS NULL AND NEW.duration_days IS NOT NULL THEN
    NEW.campaign_started_at := now();
    NEW.campaign_ends_at := now() + (NEW.duration_days || ' days')::interval;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_campaign_dates_on_activation ON public.ads;
CREATE TRIGGER trigger_set_campaign_dates_on_activation
BEFORE UPDATE ON public.ads
FOR EACH ROW
EXECUTE FUNCTION public.set_campaign_dates_on_activation();

-- Impression/click counters need to be incrementable by ANY authenticated
-- viewer (not just the ad's own owner or an admin) - a regular user scrolling
-- Discover is the one whose view/click this counts. SECURITY DEFINER so it
-- can bypass the ads UPDATE policies (which are scoped to the ad's own
-- creator) without opening a broad public UPDATE policy on the whole table.
CREATE OR REPLACE FUNCTION public.increment_ad_impression(ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ads SET impressions = impressions + 1 WHERE id = ad_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ad_click(ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ads SET clicks = clicks + 1 WHERE id = ad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ad_impression(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(uuid) TO authenticated;
