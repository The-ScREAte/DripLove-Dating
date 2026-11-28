// BoostLiveActivity - the running Boost's countdown at the top of the device, next to the camera, instead of in the
// app header.
//   iOS:     an ActivityKit Live Activity (Dynamic Island + Lock Screen), iOS 16.1+.
//            Native code: ios/App/App/BoostLiveActivityPlugin.swift, widget UI: ios/App/BoostLiveActivityWidget/.
//   Android: an ongoing notification with a counting-down chronometer (status-bar icon, countdown in the shade;
//            on Android 16+ it asks to be promoted to a status-bar chip).
//            Native code: android/app/src/main/java/com/driplove/dating/BoostLiveActivityPlugin.java.
//   Web:     nothing (every method resolves without doing anything).
//
// Wired to the boost service in ./boostLiveActivityBridge.ts.

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface BoostLiveActivityStartOptions {
  boostId: string;
  /** ms epoch the boost ends at. */
  endsAt: number;
  /** ms epoch the boost started at (drives the progress bar). Defaults to now on the native side. */
  startedAt?: number;
  title: string;
  subtitle: string;
}

export interface BoostLiveActivityEndOptions {
  /** Only remove a leftover whose end time has already passed (used at app start). */
  onlyExpired?: boolean;
}

export interface BoostLiveActivityPlugin {
  start(options: BoostLiveActivityStartOptions): Promise<void>;
  end(options?: BoostLiveActivityEndOptions): Promise<void>;
  /** false on web, iOS < 16.1, Live Activities turned off for the app, or (Android) notifications not allowed. */
  isSupported(): Promise<{ supported: boolean }>;
  /** iOS: the Live Activity was tapped (Android taps go through MainActivity's notification routing). */
  addListener(eventName: 'tap', listener: () => void): Promise<PluginListenerHandle>;
}

const noop = async () => undefined;

export const BoostLiveActivity = registerPlugin<BoostLiveActivityPlugin>('BoostLiveActivity', {
  web: {
    start: noop,
    end: noop,
    isSupported: async () => ({ supported: false }),
    addListener: async () => ({ remove: noop }),
  } as unknown as BoostLiveActivityPlugin,
});
