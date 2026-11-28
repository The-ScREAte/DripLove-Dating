import React, { useSyncExternalStore, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { activateBoost, getBoostHandlers, openBoostSheet, useBoostAvailable, useBoostLaunch, useBoostStatus } from '@/services/boost';
import { boostProgress, formatBoostWait } from '@/utils/boost';
import { BoostSeal, useBoostNow } from './BoostBolt';
import { DROP_MS, RISE_MS, boostButtonToRest, setBoostDetailsOpen, setBoostShowcase, setBoostShowOffAllowed, useBoostPhase } from './boostAttention';
import './boost.css';

/** Size of the seal at its rest spot (boost.css .dl-boost-size). */
export const BOOST_REST_SCALE = 0.6;

/**
 * The Boost control on the DripCheck card: a zigzag "seal" (only its edge turns; the bolt stays upright).
 * It rests small and still under the report button at the top right of the card, and now and then "shows off":
 * drops to the showcase spot above the expand button, turns with its glow, waits, and glides back up
 * (boostAttention.ts decides when; the motion is CSS only).
 *  ready   -> colour; a tap boosts at once and plays the launch animation from wherever the seal is
 *  active  -> colour + a white ring of the time left (stays at the rest spot); a tap opens the boost sheet
 *  waiting -> (free, today's boost used) grey with a small "16h" tag (stays at the rest spot); a tap opens Premium
 * Rendered from the card caption (so it only exists while there is a card on the DripCheck tab), drawn in a fixed
 * layer next to the report button. Hidden entirely until the backend answers (and for good without it).
 */
/**
 * placement 'card' (default): rests under the report button on the DripCheck card and does the periodic show-off.
 * placement 'float': a quiet floating button low on the right of other screens (Circle, the Chat list) - same states and
 * actions, no show-off.
 */
// While a swipe screen other than DripCheck (Circle's profile preview) shows Boost at the top, the floating one hides.
let topCount = 0;
const topListeners = new Set<() => void>();
const subscribeTop = (cb: () => void) => {
  topListeners.add(cb);
  return () => topListeners.delete(cb);
};

export const BoostButton: React.FC<{ hidden?: boolean; placement?: 'card' | 'float' | 'top' }> = ({ hidden = false, placement = 'card' }) => {
  const isCard = placement === 'card';
  const topShown = useSyncExternalStore(subscribeTop, () => topCount > 0, () => false);
  useEffect(() => {
    if (placement !== 'top') return undefined;
    topCount += 1;
    topListeners.forEach((l) => l());
    return () => {
      topCount -= 1;
      topListeners.forEach((l) => l());
    };
  }, [placement]);
  const { t } = useTranslation();
  const available = useBoostAvailable();
  const status = useBoostStatus();
  // While the launch animation's bolt is out, the seal waits empty and pops back in as the bolt lands on it.
  const launch = useBoostLaunch();
  const landing = !!launch && !launch.arrived;
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const discRef = useRef<HTMLSpanElement | null>(null);
  const showcaseRef = useRef<HTMLSpanElement | null>(null);
  const active = !!status?.active;
  const now = useBoostNow(active || (!!status && !status.canActivate && !!status.nextFreeAt));
  const { phase, phaseAt, offset } = useBoostPhase();
  const state: 'ready' | 'active' | 'waiting' | null = !status ? null : active ? 'active' : status.canActivate ? 'ready' : 'waiting';
  const live = available === true && !!state;

  // Show-offs only while a boost can be started.
  useEffect(() => {
    if (!isCard) return;
    setBoostShowOffAllowed(live && state === 'ready');
  }, [live, state, isCard]);
  useEffect(() => {
    if (!isCard) return;
    setBoostDetailsOpen(hidden);
  }, [hidden, isCard]);
  // Where the showcase spot is, relative to the rest spot (measured when a show-off starts).
  useLayoutEffect(() => {
    if (!live || !isCard) return undefined;
    setBoostShowcase(() => {
      const a = showcaseRef.current?.getBoundingClientRect();
      const b = ref.current?.getBoundingClientRect();
      if (!a || !b || !a.width || !b.width) return null;
      return { x: Math.round(a.left + a.width / 2 - (b.left + b.width / 2)), y: Math.round(a.top + a.height / 2 - (b.top + b.height / 2)) };
    });
    return () => setBoostShowcase(null);
  }, [live, isCard]);

  if (!live || !status || !state) return null;
  if (placement === 'float' && topShown) return null;

  const progress = active && status.endsAt ? boostProgress(status.endsAt, status.durationMinutes, now) : 0;
  const waitMs = status.nextFreeAt ? status.nextFreeAt - now : 0;

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (state === 'waiting' && !status.isPremium) {
      // Today's free boost is used: Premium boosts any time.
      const openPremium = getBoostHandlers().openPremium;
      if (openPremium) openPremium();
      else openBoostSheet();
      return;
    }
    if (state !== 'ready') {
      openBoostSheet();
      return;
    }
    setBusy(true);
    // The launch starts from wherever the seal is right now (rest spot or showcase spot), at its current size.
    const rect = discRef.current?.getBoundingClientRect();
    if (isCard) boostButtonToRest();
    try {
      const launchFrom = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width }
        : { x: window.innerWidth - 40, y: 120, size: 30 };
      const res = await activateBoost({ launchFrom });
      if (res.kind !== 'ok' && res.kind !== 'missing') {
        openBoostSheet();
      }
    } finally {
      setBusy(false);
    }
  };

  // Spoken durations for screen readers ("12 minutes", "16 hours"); the badge itself shows "12m" / "16h".
  const spoken = (ms: number) => {
    const minutes = Math.max(1, Math.ceil(ms / 60_000));
    if (minutes < 60) return t('boost.button.minutes', { count: minutes, defaultValue: '{{count}} minutes' });
    const hours = Math.max(1, Math.round(minutes / 60));
    return t('boost.button.hours', { count: hours, defaultValue: '{{count}} hours' });
  };
  const leftMs = active && status.endsAt ? status.endsAt - now : 0;
  const waitText = waitMs > 0 ? formatBoostWait(waitMs) : '';

  const label =
    state === 'active'
      ? leftMs > 0
        ? t('boost.button.activeLeft', 'Boost on, {{time}} left', { time: spoken(leftMs) })
        : t('boost.button.active', 'Boost is on')
      : state === 'waiting'
        ? t('boost.button.waiting', 'Next free Boost in {{time}}', { time: spoken(waitMs) })
        : t('boost.button.ready', 'Boost your profile');
  const fullLabel = state === 'waiting' && !status.isPremium ? `${label}. ${t('boost.button.upsell', 'Boost any time with Premium')}` : label;

  // A drop / rise already under way when this card mounted continues where it is.
  const since = Date.now() - phaseAt;
  const moveStyle = {
    '--dl-boost-dx': `${offset.x}px`,
    '--dl-boost-dy': `${offset.y}px`,
    animationDelay: phase === 'drop' ? `${-Math.min(DROP_MS, since)}ms` : phase === 'rise' ? `${-Math.min(RISE_MS, since)}ms` : undefined,
  } as React.CSSProperties;

  return (
    <>
      {/* the showcase spot above the expand button (never visible; only measured) */}
      {isCard && <span ref={showcaseRef} className="dl-boost-showcase" aria-hidden="true" />}
      {createPortal(
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          aria-label={fullLabel}
          title={fullLabel}
          aria-busy={busy || undefined}
          className="dl-under-popup dl-boost-btn dl-focus"
          data-state={state}
          data-busy={busy ? 'true' : undefined}
          data-landing={landing ? 'true' : undefined}
          data-phase={isCard ? phase : 'rest'}
          data-placement={placement}
        >
          <span className="dl-boost-move" style={isCard ? moveStyle : undefined}>
            <span className="dl-boost-size">
              <span ref={discRef} className="dl-boost-disc">
                <BoostSeal
                  size={placement === 'float' ? 64 : 54}
                  boltSize={placement === 'float' ? (state === 'active' ? 26 : 28) : state === 'active' ? 22 : 25}
                  tone={state === 'waiting' ? 'gray' : 'color'}
                  progress={state === 'active' ? progress : null}
                />
              </span>
            </span>
            {state === 'waiting' && waitText && <span className="dl-boost-wait">{waitText}</span>}
          </span>
        </button>,
        document.body
      )}
    </>
  );
};

export default BoostButton;
