import React, { useId, useSyncExternalStore } from 'react';

/** The Boost mark: a lightning bolt. `tone="gradient"` fills it pink -> purple, `tone="white"` is solid white. */
export const BoostBolt: React.FC<{ size?: number; tone?: 'gradient' | 'white'; className?: string }> = ({ size = 16, tone = 'gradient', className }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {tone === 'gradient' && (
        <defs>
          <linearGradient id={`bb${id}`} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f472b6" />
            <stop offset="0.55" stopColor="#ec4899" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M13.4 1.8 4.6 13.2c-.4.5 0 1.2.6 1.2h5.6l-1.5 7.2c-.2.8.8 1.3 1.3.6l8.8-11.4c.4-.5 0-1.2-.6-1.2h-5.6l1.5-7.2c.2-.8-.8-1.3-1.3-.6Z"
        fill={tone === 'gradient' ? `url(#bb${id})` : '#fff'}
      />
    </svg>
  );
};

/* ------------------------- one shared 1s clock for every countdown ------------------------- */
// Ticks only while something is subscribed, aligned to whole seconds so every countdown on screen changes together.
let now = Date.now();
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setTimeout> | null = null;
const tick = () => {
  now = Date.now();
  tickListeners.forEach((l) => l());
  tickTimer = setTimeout(tick, 1000 - (now % 1000) + 5);
};
const subscribeTick = (cb: () => void) => {
  tickListeners.add(cb);
  if (!tickTimer) {
    now = Date.now();
    tickTimer = setTimeout(tick, 1000 - (now % 1000) + 5);
  }
  return () => {
    tickListeners.delete(cb);
    if (!tickListeners.size && tickTimer) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
  };
};
const noSubscribe = () => () => {};
/** Current time, re-rendering once a second while `on`. */
export function useBoostNow(on = true): number {
  return useSyncExternalStore(on ? subscribeTick : noSubscribe, () => (on ? now : 0), () => 0) || Date.now();
}

/** prefers-reduced-motion, or the app's own reduced tier (src/motion.css). */
export const prefersReducedMotion = (): boolean => {
  try {
    if (document.documentElement.getAttribute('data-motion') === 'reduced') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
