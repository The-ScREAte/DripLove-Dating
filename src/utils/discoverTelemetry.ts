import { supabase } from '@/integrations/supabase/client';

// Fire-and-forget event logging for the two "liked you" surfacing mechanisms
// in Discover (see DiscoverPage.tsx: the always-on sparse injection is
// Mechanism A, the swipe-fatigue rescue is Mechanism B). Every call is
// non-blocking and swallows its own errors - telemetry must never be able to
// slow down or break the actual swipe experience it's trying to measure.

export type DiscoverFeedMechanism = 'A' | 'B';

interface ShownEventParams {
  viewerId: string;
  likerId: string;
  mechanism: DiscoverFeedMechanism;
  likerLastActiveDays: number | null;
  positionInDeck: number;
}

interface SwipedEventParams {
  viewerId: string;
  likerId: string;
  mechanism: DiscoverFeedMechanism;
  direction: 'like' | 'pass';
  resultedInMatch: boolean;
}

export const trackLikedYouShown = ({
  viewerId,
  likerId,
  mechanism,
  likerLastActiveDays,
  positionInDeck,
}: ShownEventParams): void => {
  void supabase
    .from('discover_feed_events')
    .insert({
      viewer_id: viewerId,
      liker_id: likerId,
      mechanism,
      event_type: 'shown',
      liker_last_active_days: likerLastActiveDays,
      position_in_deck: positionInDeck,
    })
    .then(({ error }) => {
      if (error) console.error('[discoverTelemetry] failed to log shown event:', error);
    });
};

export const trackLikedYouSwiped = ({
  viewerId,
  likerId,
  mechanism,
  direction,
  resultedInMatch,
}: SwipedEventParams): void => {
  void supabase
    .from('discover_feed_events')
    .insert({
      viewer_id: viewerId,
      liker_id: likerId,
      mechanism,
      event_type: 'swiped',
      direction,
      resulted_in_match: resultedInMatch,
    })
    .then(({ error }) => {
      if (error) console.error('[discoverTelemetry] failed to log swiped event:', error);
    });
};
