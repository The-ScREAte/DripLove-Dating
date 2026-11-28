import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { openBoostSheet, useBoostAvailable, useBoostLaunch, useBoostStatus } from '@/services/boost';
import { boostProgress, formatBoostClock } from '@/utils/boost';
import { BoostBolt, useBoostNow } from './BoostBolt';

interface Place {
  left: number | null;
  compact: boolean;
  /** No room between logo and tagline even for the compact pill: the tagline steps aside, the pill takes its spot. */
  replaceTagline: boolean;
}
const DEFAULT_PLACE: Place = { left: null, compact: false, replaceTagline: false };
const AIR = 8;

/**
 * Where the pill fits WITHOUT covering any header text: in the free space between the logo and the tagline
 * ("Boost 14:59", or just the bolt + time when that is tight). Only when even that does not fit (narrow phone + a long
 * translated tagline) does the tagline fade out while the pill sits in its place.
 */
function measurePlace(anchor: HTMLElement | null): Place {
  const hdr = document.querySelector('[data-driplove-global-header]');
  const logo = hdr?.querySelector('img');
  const tagline = hdr?.querySelector('.font-brush');
  if (!anchor || !hdr || !logo || !tagline) return DEFAULT_PLACE;
  const l = logo.getBoundingClientRect();
  const r = tagline.getBoundingClientRect();
  const full = anchor.offsetWidth;
  const label = anchor.querySelector<HTMLElement>('.dl-boost-timer-label');
  const compact = full - (label ? label.offsetWidth + 6 : 0);
  const gap = r.left - l.right;
  if (gap >= full + AIR * 2) return { left: Math.round(l.right + (gap - full) / 2), compact: false, replaceTagline: false };
  if (gap >= compact + AIR * 2) return { left: Math.round(l.right + (gap - compact) / 2), compact: true, replaceTagline: false };
  return { left: null, compact: false, replaceTagline: true };
}

/**
 * The running boost as a small pill in the app header (like the iPhone status-bar timer): bolt + "Boost 14:59".
 * Ticks every second, leaves when the boost ends; a tap opens the boost sheet. While the launch animation flies in it
 * stays hidden, then pops in where the bolt lands.
 */
const BoostTopTimer: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
  const { t } = useTranslation();
  const available = useBoostAvailable();
  const status = useBoostStatus();
  const launch = useBoostLaunch();
  const active = !!status?.active && !!status.endsAt;
  const now = useBoostNow(active);
  const left = active ? Math.max(0, (status?.endsAt as number) - now) : 0;
  const show = active && left > 0 && (!launch || launch.arrived);

  // Keep the pill mounted for its exit animation.
  const [mounted, setMounted] = useState(show);
  const [leaving, setLeaving] = useState(false);
  const [lastText, setLastText] = useState('');
  useEffect(() => {
    if (show) {
      setMounted(true);
      setLeaving(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setLeaving(true);
    const id = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, 320);
    return () => clearTimeout(id);
  }, [show, mounted]);

  const clock = formatBoostClock(left);
  useEffect(() => {
    if (show) setLastText(clock);
  }, [show, clock]);

  // Placement: measured against the real header (fonts load late, phones rotate, languages change).
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const wantPlace = available === true && (active || !!launch);
  useLayoutEffect(() => {
    if (!wantPlace) return undefined;
    const update = () => {
      const next = measurePlace(anchorRef.current);
      setPlace((cur) => (cur.left === next.left && cur.compact === next.compact && cur.replaceTagline === next.replaceTagline ? cur : next));
    };
    update();
    const tagline = document.querySelector('[data-driplove-global-header] .font-brush');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro && tagline) ro.observe(tagline);
    window.addEventListener('resize', update);
    document.fonts?.ready.then(update).catch(() => {});
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [wantPlace]);

  // Only when there is no room: the header tagline steps aside while the pill is there (see boost.css).
  const onScreen = mounted && !leaving && !hidden && available === true && place.replaceTagline;
  useEffect(() => {
    const root = document.documentElement;
    if (onScreen) root.setAttribute('data-dl-boosting', '');
    else root.removeAttribute('data-dl-boosting');
    return () => root.removeAttribute('data-dl-boosting');
  }, [onScreen]);
  const posStyle: React.CSSProperties | undefined = place.left !== null ? { left: place.left, right: 'auto' } : undefined;

  if (available !== true) return null;
  const progress = active && status?.endsAt ? boostProgress(status.endsAt, status.durationMinutes, now) : 1;
  const text = show ? clock : lastText;

  return createPortal(
    <>
      {/* where the launch animation aims (always there, never visible) */}
      {/* Always the FULL pill (it is what gets measured); the launch aims at its bolt, which sits at the same spot. */}
      <div ref={anchorRef} data-boost-timer-anchor className="dl-boost-timer-pos dl-boost-timer dl-boost-anchor" style={posStyle} aria-hidden="true">
        <span className="dl-boost-timer-bolt" />
        <span className="dl-boost-timer-label">{t('boost.timer.label', 'Boost')}</span>
        <span className="dl-boost-timer-clock">{formatBoostClock((status?.durationMinutes ?? 15) * 60_000)}</span>
      </div>
      {mounted && !hidden && (
        <button
          type="button"
          className="dl-under-popup dl-boost-timer-pos dl-boost-timer dl-focus"
          data-leaving={leaving ? 'true' : undefined}
          style={posStyle}
          onClick={openBoostSheet}
          aria-label={t('boost.timer.aria', 'Boost on, {{time}} left', { time: text })}
        >
          <span className="dl-boost-timer-bolt" aria-hidden="true">
            <svg viewBox="0 0 22 22" className="dl-boost-timer-ring">
              <circle cx="11" cy="11" r="9.5" className="dl-boost-ring-track" />
              <circle cx="11" cy="11" r="9.5" className="dl-boost-ring-fill" strokeDasharray={59.7} strokeDashoffset={59.7 * progress} />
            </svg>
            <BoostBolt size={11} tone="white" />
          </span>
          {!place.compact && <span className="dl-boost-timer-label">{t('boost.timer.label', 'Boost')}</span>}
          <span className="dl-boost-timer-clock">{text}</span>
        </button>
      )}
    </>,
    document.body
  );
};

export default BoostTopTimer;
