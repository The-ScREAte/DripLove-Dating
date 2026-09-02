-- Minimal telemetry for the two "liked you" surfacing mechanisms in Discover
-- (the always-on sparse injection, and the swipe-fatigue rescue). Neither
-- mechanism had any measurement before this - every tuning decision (cap %,
-- spacing, activity gate) was being made blind. This is intentionally the
-- smallest table that answers "is this mechanism actually leading to
-- matches": one row per shown-or-swiped event, no analytics platform needed.

CREATE TABLE IF NOT EXISTS public.discover_feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  liker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mechanism TEXT NOT NULL CHECK (mechanism IN ('A', 'B')),
  event_type TEXT NOT NULL CHECK (event_type IN ('shown', 'swiped')),
  direction TEXT CHECK (direction IN ('like', 'pass')),
  resulted_in_match BOOLEAN,
  liker_last_active_days INTEGER,
  position_in_deck INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discover_feed_events_viewer_liker
  ON public.discover_feed_events (viewer_id, liker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discover_feed_events_mechanism
  ON public.discover_feed_events (mechanism, event_type, created_at DESC);

ALTER TABLE public.discover_feed_events ENABLE ROW LEVEL SECURITY;

-- A user can only ever log events about their own feed (viewer_id = them) -
-- this is write-your-own-telemetry only, never readable/writable for anyone
-- else's rows client-side.
CREATE POLICY "Users can insert their own discover feed events"
  ON public.discover_feed_events
  FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Users can view their own discover feed events"
  ON public.discover_feed_events
  FOR SELECT
  USING (auth.uid() = viewer_id);

CREATE POLICY "Admins can view all discover feed events"
  ON public.discover_feed_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
