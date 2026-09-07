-- Raises the absolute ceiling on profiles.max_distance from 500km to 2000km
-- so premium users can search further. Free vs. premium enforcement (800km
-- vs 2000km) happens at query time in the app (DiscoverPage.tsx), same
-- pattern already used for e.g. "cancelled but not yet expired stays
-- premium" - this constraint is just the outer bound everyone must fit
-- inside, not the per-tier cap itself.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_max_distance;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_max_distance CHECK (max_distance > 0 AND max_distance <= 2000);
