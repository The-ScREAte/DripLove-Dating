-- Revises the max_distance ceiling down from 2000km to 1020km (premium's new
-- cap; free stays capped at 600km, enforced at query time in DiscoverPage.tsx
-- as before) - see 20260911000000_raise_max_distance_ceiling.sql for why this
-- constraint exists at all.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_max_distance;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_max_distance CHECK (max_distance > 0 AND max_distance <= 1020);
