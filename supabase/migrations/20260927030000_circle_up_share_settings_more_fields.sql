-- Expands the Circle Up share-settings default to cover bio/occupation/
-- relationship intent alongside age/location/interests, matching the
-- Prepare screen now offering a toggle for each field a user's profile
-- actually has populated. No feature launch yet (no real rows depend on
-- the old default shape), so just widening the default is enough.

ALTER TABLE public.circle_up_queue
  ALTER COLUMN share_settings SET DEFAULT '{"age":true,"location":true,"interests":true,"bio":true,"occupation":true,"relationshipIntent":true}'::jsonb;
