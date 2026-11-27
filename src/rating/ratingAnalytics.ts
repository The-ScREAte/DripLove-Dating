/**
 * Rating funnel analytics. The app has no event-analytics SDK wired yet, so
 * events go to a pluggable sink (default: dev console + a small local ring
 * buffer that support/admin tooling can read). Funnel:
 *   moment -> eligible -> native_requested -> store_page_opened / feedback_sent
 * (Neither store tells the app whether the native sheet actually appeared or
 * what the user chose, so "native_requested" is the deepest observable step.)
 */
export type RatingEventName =
  | 'moment'
  | 'ask_skipped'
  | 'native_requested'
  | 'native_error'
  | 'rate_card_viewed'
  | 'store_page_opened'
  | 'store_page_failed'
  | 'feedback_opened'
  | 'feedback_sent';

type Sink = (name: RatingEventName, props?: Record<string, unknown>) => void;

let sink: Sink | null = null;
const RING_KEY = 'driplove_rating_events';
const RING_MAX = 60;

/** Plug a real analytics SDK in here (Firebase Analytics, PostHog, ...). */
export const setRatingAnalyticsSink = (next: Sink | null): void => {
  sink = next;
};

export const trackRating = (name: RatingEventName, props?: Record<string, unknown>): void => {
  try {
    sink?.(name, props);
    const raw = localStorage.getItem(RING_KEY);
    const ring: unknown[] = raw ? JSON.parse(raw) : [];
    ring.push({ name, props, at: Date.now() });
    localStorage.setItem(RING_KEY, JSON.stringify(ring.slice(-RING_MAX)));
  } catch {
    // analytics must never throw into app code
  }
};
