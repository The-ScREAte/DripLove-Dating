-- New "Favorites" profile field: a small, curated top-3 pick (sports,
-- music, etc.) shown alongside Interests in the profile info area. Same
-- text[] shape as interests/adinkra_symbols; capped at 3 client-side (see
-- FavoritesEditor.tsx), same pattern adinkra_symbols already established.
ALTER TABLE public.profiles
ADD COLUMN favorites text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.favorites IS 'User selected favorite things (optional, max 3)';
