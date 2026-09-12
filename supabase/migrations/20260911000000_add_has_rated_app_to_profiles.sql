-- Tracks, per account (not just per-device localStorage), whether a user has
-- ever tapped "Yes" on the in-app rating funnel and triggered the native
-- App Store / Play Store review prompt. Neither Apple nor Google tell the
-- app whether their review sheet actually displayed (their own quota system
-- can silently no-op it), so "tapped Yes" is the only real signal available -
-- and per product decision, that's what permanently stops us from asking
-- again, on any device, for this account.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_rated_app boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rated_app_at timestamptz;
