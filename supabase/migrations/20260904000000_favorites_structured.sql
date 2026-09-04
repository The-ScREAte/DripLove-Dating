-- Favorites started as a flat text[] of category names ("Sports", "Music").
-- Redesigned to hold a per-item detail (e.g. which sport, which artist/
-- album) and an optional share link (mainly for Music), so it needs a
-- structured shape instead: jsonb array of {category, detail?, link?}.
-- This feature only just shipped (no real user data depends on the old
-- shape), so a clean drop-and-recreate is safe here rather than a
-- best-effort cast of the old string values.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS favorites;

ALTER TABLE public.profiles
ADD COLUMN favorites jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.favorites IS
  'User selected favorites (optional, max 3). Array of {category: string, detail?: string, link?: string} - e.g. {"category":"Sports","detail":"Basketball"} or {"category":"Music","detail":"Drake - Scorpion","link":"https://open.spotify.com/..."}.';
