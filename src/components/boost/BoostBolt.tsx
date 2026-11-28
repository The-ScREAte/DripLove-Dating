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

/* ------------------------- the Boost seal (zigzag badge) ------------------------- */
// A 16-point starburst ("seal") in a 48x48 box, built once.
const SEAL_POINTS = 16;
const SEAL_PATH = (() => {
  const out: string[] = [];
  for (let i = 0; i < SEAL_POINTS * 2; i++) {
    const r = i % 2 === 0 ? 22.6 : 19.6;
    const a = (Math.PI * i) / SEAL_POINTS - Math.PI / 2;
    out.push(`${(24 + r * Math.cos(a)).toFixed(2)} ${(24 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${out.join('L')}Z`;
})();

/**
 * The Boost seal: a zigzag-edged badge with an upright bolt. Only the edge layer turns (CSS, transform-only);
 * the centre disc, the bolt and the optional progress ring stay still.
 *  tone="color" -> brand pink -> purple, "gray" -> desaturated (boost used), "white" -> white badge + gradient bolt
 *  progress (0..1 used) -> thin white ring of the time left
 */
export const BoostSeal: React.FC<{
  size?: number;
  tone?: 'color' | 'gray' | 'white';
  progress?: number | null;
  boltSize?: number;
  className?: string;
}> = ({ size = 48, tone = 'color', progress = null, boltSize, className }) => {
  const id = useId().replace(/:/g, '');
  const g = `bs${id}`;
  const stops =
    tone === 'gray'
      ? ['#8e8e98', '#63636d', '#45454e']
      : tone === 'white'
        ? ['#ffffff', '#fff5fb', '#f5ecff']
        : ['#f472b6', '#ec4899', '#a855f7'];
  const grad = (
    <linearGradient id={g} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor={stops[0]} />
      <stop offset="0.5" stopColor={stops[1]} />
      <stop offset="1" stopColor={stops[2]} />
    </linearGradient>
  );
  const edgeStroke = tone === 'white' ? 'rgba(236,72,153,0.35)' : tone === 'gray' ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.9)';
  const C = 2 * Math.PI * 15; // progress ring circumference
  return (
    <span className={`dl-seal ${className ?? ''}`} data-tone={tone} style={{ width: size, height: size }} aria-hidden="true">
      <svg className="dl-seal-edge" viewBox="0 0 48 48" focusable="false">
        <defs>{grad}</defs>
        <path d={SEAL_PATH} fill={`url(#${g})`} stroke={edgeStroke} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <svg className="dl-seal-core" viewBox="0 0 48 48" focusable="false">
        <defs>{React.cloneElement(grad, { id: `${g}c` })}</defs>
        <circle cx="24" cy="24" r="17.4" fill={`url(#${g}c)`} />
        <circle cx="24" cy="24" r="17.4" fill="none" stroke={tone === 'white' ? 'rgba(236,72,153,0.25)' : 'rgba(255,255,255,0.3)'} strokeWidth="0.9" />
        {progress !== null && (
          <g transform="rotate(-90 24 24)">
            <circle cx="24" cy="24" r="15" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            <circle
              className="dl-seal-ring"
              cx="24"
              cy="24"
              r="15"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * Math.min(1, Math.max(0, progress))}
            />
          </g>
        )}
      </svg>
      <BoostBolt
        size={boltSize ?? Math.round(size * 0.46)}
        tone={tone === 'white' ? 'gradient' : 'white'}
        className="dl-seal-bolt"
      />
    </span>
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

/* While the app / tab is in the background, html[data-dl-hidden] pauses the Boost loops (boost.css). Set up once, the
   first time a Boost piece loads; costs one listener. */
if (typeof document !== 'undefined') {
  const syncHidden = () => {
    if (document.hidden) document.documentElement.setAttribute('data-dl-hidden', '');
    else document.documentElement.removeAttribute('data-dl-hidden');
  };
  syncHidden();
  document.addEventListener('visibilitychange', syncHidden);
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
