// Mirrors the running Boost into the native countdown at the top of the device (iOS Live Activity / Android ongoing
// notification - see ./boostLiveActivity.ts). Started once from main.tsx; does nothing on web.
//
//   boost started / found running at app start / end time corrected  -> start({ boostId, endsAt, ... })
//   boost over (ran out, server says it stopped, signed out)          -> end()
//   app start with nothing running                                    -> end({ onlyExpired: true }) clears a leftover
//                                                                        whose time already ran out while the app was
//                                                                        closed (a still-running one is kept, so it
//                                                                        does not flicker before the boost loads)
//   Live Activity tapped (iOS)                                         -> same place a boost push opens
//
// Every native call is fire-and-forget: an older app binary without the plugin, Live Activities turned off, or
// notifications not allowed must never break the boost itself.

import { Capacitor } from '@capacitor/core';
import i18n from '@/i18n/config';
import { onBoostEnded, onBoostStarted, type BoostStartedInfo } from '@/services/boost';
import { openFromNotificationTap } from '@/services/pushNotifications';
import { FREE_BOOST_MINUTES, PREMIUM_BOOST_MINUTES } from '@/utils/boost';
import { BoostLiveActivity, type BoostLiveActivityPlugin } from './boostLiveActivity';

export interface BoostLiveActivityBridgeDeps {
  isNative: () => boolean;
  plugin: Pick<BoostLiveActivityPlugin, 'start' | 'end' | 'addListener'>;
  onBoostStarted: (cb: (b: BoostStartedInfo) => void) => () => void;
  onBoostEnded: (cb: () => void) => () => void;
  t: (key: string, fallback: string) => string;
  openBoost: () => void;
  now: () => number;
}

const defaultDeps = (): BoostLiveActivityBridgeDeps => ({
  isNative: () => Capacitor.isNativePlatform(),
  plugin: BoostLiveActivity,
  onBoostStarted,
  onBoostEnded: (cb) => onBoostEnded(() => cb()),
  t: (key, fallback) => {
    try {
      const v = i18n.t(key, { defaultValue: fallback });
      return typeof v === 'string' && v ? v : fallback;
    } catch {
      return fallback;
    }
  },
  openBoost: () => openFromNotificationTap(undefined, { action: 'open_boost' }),
  now: () => Date.now(),
});

const quiet = (p: Promise<unknown> | undefined) => {
  try {
    p?.catch(() => undefined);
  } catch {
    /* ignore */
  }
};

let stopCurrent: (() => void) | null = null;

/** Idempotent; returns a stop function (tests). */
export function initBoostLiveActivityBridge(overrides: Partial<BoostLiveActivityBridgeDeps> = {}): () => void {
  if (stopCurrent) return stopCurrent;
  const d = { ...defaultDeps(), ...overrides };
  if (!d.isNative()) {
    stopCurrent = () => {
      stopCurrent = null;
    };
    return stopCurrent;
  }

  let running: string | null = null;

  const start = (b: BoostStartedInfo) => {
    if (!b.endsAt || b.endsAt <= d.now()) return;
    running = b.boostId;
    const minutes = b.kind === 'premium' ? PREMIUM_BOOST_MINUTES : FREE_BOOST_MINUTES;
    const startedAt = Math.min(d.now(), b.endsAt - minutes * 60_000);
    quiet(
      d.plugin.start({
        boostId: b.boostId,
        endsAt: b.endsAt,
        startedAt,
        title: d.t('boost.button.active', 'Boost is on'),
        subtitle: d.t('boost.sheet.activeTitle', "You're boosted"),
      }),
    );
  };
  const end = () => {
    running = null;
    quiet(d.plugin.end());
  };

  // A boost already running is reported synchronously by onBoostStarted; only clear leftovers if nothing is.
  const offStarted = d.onBoostStarted(start);
  const offEnded = d.onBoostEnded(end);
  if (!running) quiet(d.plugin.end({ onlyExpired: true }));

  let tapHandle: { remove: () => Promise<void> } | null = null;
  let stopped = false;
  try {
    d.plugin
      .addListener('tap', () => d.openBoost())
      .then((h) => {
        if (stopped) void h.remove().catch(() => undefined);
        else tapHandle = h;
      })
      .catch(() => undefined);
  } catch {
    /* plugin missing in this binary */
  }

  stopCurrent = () => {
    stopped = true;
    offStarted();
    offEnded();
    if (tapHandle) void tapHandle.remove().catch(() => undefined);
    stopCurrent = null;
  };
  return stopCurrent;
}
