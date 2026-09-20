-- "Free tonight" - a simple yes/no lifestyle field for tracking same-night
-- availability. Text 'yes'/'no' (nullable = not yet answered), matching the
-- existing smoking/drinking column convention rather than a real boolean, so
-- ProfilePage's existing string-based Select handling works unchanged.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_tonight text;
