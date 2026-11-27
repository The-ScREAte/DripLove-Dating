import type { ReactNode } from 'react';
import { PopupStore } from './store';
import type { PopupDefinition, PopupOutcome, PopupRequestOptions, PopupEnv, BusyReason, PopupEvent } from './types';

/** App-wide singleton. Everything below is a thin wrapper so callers never touch the class. */
export const popupStore = new PopupStore();

// ---- Analytics: shown / dismissed / converted / preempted / dropped / expired ----------------------------
// The app has no analytics SDK yet, so events go to a pluggable sink plus a small local ring buffer
// (last 60 events, key dl_popup_events) that support tooling can read. Plug a real SDK in with setPopupAnalyticsSink.
type PopupSink = (event: PopupEvent) => void;
let sink: PopupSink | null = null;
const RING_KEY = 'dl_popup_events';
const RING_MAX = 60;

export const setPopupAnalyticsSink = (next: PopupSink | null): void => {
  sink = next;
};

popupStore.onEvent = (event) => {
  try {
    sink?.(event);
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RING_KEY) : null;
    const ring: PopupEvent[] = raw ? JSON.parse(raw) : [];
    ring.push(event);
    localStorage.setItem(RING_KEY, JSON.stringify(ring.slice(-RING_MAX)));
  } catch {
    // telemetry must never break the app
  }
};

/** What a registered renderer receives. `close('converted')` when the user took the offered action. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PopupRenderArgs<P = any> {
  payload: P | undefined;
  close: (outcome?: Extract<PopupOutcome, 'dismissed' | 'converted'>) => void;
  services: PopupServices;
}

/** Things the host (MainApp) gives popups so they can navigate without importing MainApp. */
export interface PopupServices {
  currentUser: ({ id?: string | null; email?: string | null; first_name?: string | null } & Record<string, unknown>) | null;
  currentUserName: string;
  onNavigateToChat: (userId: string) => void;
  onNavigateToVerify: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderers = new Map<string, (args: PopupRenderArgs<any>) => ReactNode>();

/**
 * Register a popup (definition + how to draw it). Call once at module load.
 * Popups with `inline: true` need no renderer: the owning component renders its own UI
 * while `useIsPopupActive(id)` is true.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registerPopup = <P = any>(
  def: PopupDefinition<P>,
  render?: (args: PopupRenderArgs<P>) => ReactNode
): void => {
  popupStore.register(def as PopupDefinition);
  if (render) renderers.set(def.id, render as (args: PopupRenderArgs) => ReactNode);
};

export const getPopupRenderer = (id: string) => renderers.get(id);

/** Ask to show a popup. The coordinator decides when (or whether). Safe to call from anywhere, repeatedly. */
export const requestPopup = <P = unknown>(id: string, payload?: P, options?: PopupRequestOptions): boolean =>
  popupStore.request(id, payload, options);

/** The one way to open the upgrade page: a tap on Upgrade / a locked feature / out of swipes. */
export const openPremiumUpgrade = (): boolean => popupStore.request('premium-upgrade', { preselectedPlan: 'premium' as const });

/** Close it (or drop it from the queue). Use 'converted' when the user took the action. */
export const closePopup = (id: string, outcome: Extract<PopupOutcome, 'dismissed' | 'converted'> = 'dismissed'): void =>
  popupStore.close(id, outcome);

/** Forget a queued request whose reason went away. */
export const cancelPopup = (id: string): void => popupStore.cancel(id);

/** Lifetime count of showings for this user (cheap pre-check before doing work to trigger a one-time popup). */
export const popupTimesShown = (id: string): number => popupStore.timesShown(id);

export const setPopupEnv = (patch: Partial<PopupEnv>): void => popupStore.setEnv(patch);
export const setPopupBusy = (reason: BusyReason, busy: boolean): void => popupStore.setBusy(reason, busy);

