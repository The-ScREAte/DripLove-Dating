import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { CameraOff } from 'lucide-react';
import { getPrivacyScreenPlugin, enablePrivacyScreen, disablePrivacyScreen } from '@/utils/privacyScreenBridge';

// Reacts to the native PrivacyScreen plugin's screenshot/recording
// detection (already emitted on iOS via UIApplication.userDidTakeScreenshot
// / UIScreen.capturedDidChange - see PrivacyScreen.swift) with a full-screen
// "blocked" message, the same user-facing pattern apps like WhatsApp use.
// Android needs none of this: FLAG_SECURE (see useAllowScreenshots.ts /
// capacitor.config.ts) makes the OS refuse the capture outright, with no
// event to react to - this component silently does nothing there.
//
// Important limitation: iOS has no public API to stop the screenshot/
// recording from happening or to blank out the image already saved to
// Photos - this overlay is shown immediately after the fact, matching what
// the user sees, but the captured image itself is not altered.
//
// `isAuthenticated` gates whether the listeners are even active: the native
// screenshotTaken/screenRecordingStarted events fire unconditionally
// (native code has no concept of login state), but the actual capture block
// (PrivacyScreen.enable(), see privacyScreenBridge.ts) is only ever turned
// on post-login - so without this gate, screenshotting the landing/login
// page popped a "blocked" message for a screenshot that was never actually
// blocked there.
const ScreenCaptureBlockedOverlay = ({ isAuthenticated = false }: { isAuthenticated?: boolean }) => {
  // Always mounted (while native + signed in) and only toggled through direct DOM writes - no React state/render at
  // event time, so the message can appear in the same task the native event arrives in. Recording additionally hides
  // everything immediately (and the native side covers the screen synchronously on its own).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  // App-level owner of the login-lifecycle protection: this component is mounted above the router for the whole app
  // life, so protection (and the native saved-session flag) follows the auth state no matter which route is showing -
  // Index/MainApp unmount whenever a logged-in user opens another route (Circle Up call, face verification, ...).
  useLayoutEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (isAuthenticated) void enablePrivacyScreen();
    else void disablePrivacyScreen();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isAuthenticated) return;

    const show = (mode: 'screenshot' | 'recording') => {
      const root = rootRef.current;
      if (!root) return;
      if (textRef.current) {
        textRef.current.textContent =
          mode === 'recording'
            ? 'To protect everyone on DripLove, screen recording is blocked while this app is open.'
            : 'To protect everyone on DripLove, this screenshot has been blocked.';
      }
      root.dataset.mode = mode;
      root.style.display = 'flex';
    };
    const hide = () => {
      const root = rootRef.current;
      if (!root) return;
      root.dataset.mode = 'none';
      root.style.display = 'none';
    };

    let screenshotHandle: { remove: () => void } | undefined;
    let recordingStartHandle: { remove: () => void } | undefined;
    let recordingStopHandle: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const PrivacyScreen = (await getPrivacyScreenPlugin())?.plugin;
      if (cancelled || !PrivacyScreen) return;

      screenshotHandle = await PrivacyScreen.addListener('screenshotTaken', () => {
        show('screenshot');
        if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = window.setTimeout(hide, 1800);
      });

      recordingStartHandle = await PrivacyScreen.addListener('screenRecordingStarted', () => {
        if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
        show('recording');
      });

      recordingStopHandle = await PrivacyScreen.addListener('screenRecordingStopped', () => {
        if (rootRef.current?.dataset.mode === 'recording') hide();
      });
    })();

    return () => {
      cancelled = true;
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
      screenshotHandle?.remove();
      recordingStartHandle?.remove();
      recordingStopHandle?.remove();
      rootRef.current?.setAttribute('data-mode', 'none');
      if (rootRef.current) rootRef.current.style.display = 'none';
    };
  }, [isAuthenticated]);

  if (!Capacitor.isNativePlatform() || !isAuthenticated) return null;

  return (
    <div
      ref={rootRef}
      data-mode="none"
      style={{ display: 'none' }}
      className="fixed inset-0 z-[99999] bg-black flex-col items-center justify-center px-8"
      role="alert"
      aria-live="assertive"
    >
      <div className="p-5 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full mb-6">
        <CameraOff className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-white text-xl font-bold text-center mb-2">Screen capture blocked</h2>
      <p ref={textRef} className="text-white/60 text-sm text-center max-w-xs" />
    </div>
  );
};

export default ScreenCaptureBlockedOverlay;
