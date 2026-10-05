import React, { useEffect, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { CameraOff } from 'lucide-react';
import { getPrivacyScreenPlugin } from '@/utils/privacyScreenBridge';

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
  const [mode, setMode] = useState<'none' | 'screenshot' | 'recording'>('none');
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isAuthenticated) {
      setMode('none');
      return;
    }

    let screenshotHandle: { remove: () => void } | undefined;
    let recordingStartHandle: { remove: () => void } | undefined;
    let recordingStopHandle: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const PrivacyScreen = (await getPrivacyScreenPlugin())?.plugin;
      if (cancelled || !PrivacyScreen) return;

      screenshotHandle = await PrivacyScreen.addListener('screenshotTaken', () => {
        setMode('screenshot');
        if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = window.setTimeout(() => setMode('none'), 1800);
      });

      recordingStartHandle = await PrivacyScreen.addListener('screenRecordingStarted', () => {
        if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
        setMode('recording');
      });

      recordingStopHandle = await PrivacyScreen.addListener('screenRecordingStopped', () => {
        setMode((prev) => (prev === 'recording' ? 'none' : prev));
      });
    })();

    return () => {
      cancelled = true;
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
      screenshotHandle?.remove();
      recordingStartHandle?.remove();
      recordingStopHandle?.remove();
    };
  }, [isAuthenticated]);

  if (mode === 'none') return null;

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black flex flex-col items-center justify-center px-8"
      role="alert"
      aria-live="assertive"
    >
      <div className="p-5 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full mb-6">
        <CameraOff className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-white text-xl font-bold text-center mb-2">Screen capture blocked</h2>
      <p className="text-white/60 text-sm text-center max-w-xs">
        {mode === 'recording'
          ? 'To protect everyone on DripLove, screen recording is blocked while this app is open.'
          : "To protect everyone on DripLove, this screenshot has been blocked."}
      </p>
    </div>
  );
};

export default ScreenCaptureBlockedOverlay;
