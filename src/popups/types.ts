import type { ReactNode } from 'react';

/** critical > transactional > engagement > passive. */
export type PopupTier = 'critical' | 'transactional' | 'engagement' | 'passive';

export const TIER_RANK: Record<PopupTier, number> = {
  critical: 0,
  transactional: 1,
  engagement: 2,
  passive: 3,
};

/** Things that make interrupting the user wrong right now. */
export type BusyReason =
  | 'typing'
  | 'touching'
  | 'keyboard'
  | 'chat-detail'
  | 'blocking-screen'
  | 'camera'
  | 'call'
  | 'payment'
  | 'os-permission'
  | (string & {});

export interface PopupEnv {
  authed: boolean;
  /** false during sign-up / complete-profile / terms: nothing may show. */
  onboardingDone: boolean;
  /** Active tab or route key ('dripcheck' | 'circle' | 'chat' | 'liked' | 'profile' ...). */
  screen: string;
  /** null = not known yet. */
  isPremium: boolean | null;
  /** Profile + subscription state have loaded. */
  dataReady: boolean;
  /** App in the foreground. */
  appActive: boolean;
}

export const DEFAULT_ENV: PopupEnv = {
  authed: false,
  onboardingDone: false,
  screen: '',
  isPremium: null,
  dataReady: false,
  appActive: true,
};

export type PopupOutcome = 'dismissed' | 'converted' | 'preempted' | 'expired' | 'dropped';

// P defaults to any: the registry holds popups with different payload shapes, and registerPopup<P>() keeps each one typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PopupDefinition<P = any> {
  id: string;
  tier: PopupTier;
  /** Only show while the user is on one of these screens. Omit for any screen. */
  screens?: readonly string[];
  /** Extra condition. If it returns false the request is dropped (unless keepWhenIneligible). */
  eligible?: (env: PopupEnv, payload: P | undefined) => boolean;
  keepWhenIneligible?: boolean;
  /** Min ms between two showings (persisted per user). May depend on the payload. */
  cooldownMs?: number | ((payload: P | undefined) => number);
  maxPerDay?: number;
  maxPerSession?: number;
  /** Lifetime cap, e.g. 1 for one-time tutorials. */
  maxTotal?: number;
  /** Don't show until the user has been on the app this long (persisted first-seen). */
  minAppAgeMs?: number;
  /** User asked for it (tapped Upgrade): skips gaps/quiet time, preempts engagement/passive popups. */
  userInitiated?: boolean;
  /** How long a queued request stays valid. Default 10 min. */
  ttlMs?: number;
  /** Override which busy reasons block this popup. Default depends on tier. */
  blockedBy?: readonly BusyReason[];
  /** Skip the isPremium/dataReady wait (for popups that don't depend on them). */
  ignoreDataReady?: boolean;
  /** For popups the owning component renders itself (inline coachmarks): host renders nothing. */
  inline?: boolean;
  /** One-time import of an older "already shown" record so existing users aren't re-nagged. */
  legacy?: (userId: string) => Partial<PopupRecord> | null;
  /** Called the moment the popup becomes visible (e.g. to mark a funnel step as shown). */
  onShown?: (payload: P | undefined) => void;
  /** Close automatically after this long (tutorial overlays). */
  autoCloseMs?: number;
}

export interface PopupRecord {
  lastShownAt: number | null;
  dayKey: string;
  dayCount: number;
  total: number;
  lastOutcome: PopupOutcome | null;
}

export interface PopupRequestOptions {
  ttlMs?: number;
  /** Don't show before this many ms from now (e.g. 3 s after a match screen closes). */
  delayMs?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ActivePopup<P = any> {
  id: string;
  payload: P | undefined;
  /** Changes for every showing so the host remounts. */
  key: string;
  shownAt: number;
}

export interface PopupEvent {
  type: 'shown' | PopupOutcome;
  id: string;
  tier: PopupTier;
  at: number;
}

export type PopupRenderer = (args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  close: (outcome?: Extract<PopupOutcome, 'dismissed' | 'converted'>) => void;
}) => ReactNode;
