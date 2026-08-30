-- The existing "Anyone can view active ads" policy only shows is_active=true
-- rows (or everything, to admins) - a regular advertiser had no way to see
-- their OWN pending/paused ad in Profile > Advertisement > My Ads, since
-- their own ad starts is_active=false until an admin approves it. Confirmed
-- via a real end-to-end test (demo@gmail.com, business creation, ad
-- creation): the ad was inserted correctly but never showed up in "My Ads".
CREATE POLICY "Advertisers can view their own ads"
ON public.ads
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);
