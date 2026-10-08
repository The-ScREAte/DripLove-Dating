import React, { useCallback, useEffect, useRef } from 'react';
import HoppingLogo from '@/components/HoppingLogo';

// Pull-to-refresh that tracks the finger 1:1 (with resistance) and only
// animates when it settles. The old version set React state on every touchmove
// (re-rendering the whole page) and kept a 300ms height transition running
// while dragging, so the indicator lagged behind the finger, then jumped.
// Here the drag writes straight to the indicator's style once per frame; React
// is only involved when a refresh starts or ends.

const TRIGGER = 64; // release past this (visual px) to refresh
const MAX_PULL = 120; // the indicator never opens further than this
const HOLD = 56; // height it rests at while refreshing
const SETTLE = 'height 260ms cubic-bezier(0.2, 0.8, 0.2, 1)';

// Finger travel -> visual pull: follows closely at first, then firms up,
// like the native iOS rubber band.
const resist = (dy: number) => MAX_PULL * (1 - 1 / (1 + dy / MAX_PULL));

interface Options {
  onRefresh: () => unknown;
  isRefreshing: boolean;
  /** scrollTop of the list being pulled; a pull only starts at the very top. */
  getScrollTop: () => number;
  enabled?: boolean;
}

export function usePullToRefresh({ onRefresh, isRefreshing, getScrollTop, enabled = true }: Options) {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pull = useRef(0);
  const frame = useRef(0);
  const refreshing = useRef(isRefreshing);

  const paint = useCallback((height: number, settle: boolean) => {
    const indicator = indicatorRef.current;
    if (!indicator) return;
    indicator.style.transition = settle ? SETTLE : 'none';
    indicator.style.height = `${height}px`;
    const icon = iconRef.current;
    if (icon) {
      const progress = Math.min(1, height / TRIGGER);
      icon.style.transition = settle ? 'opacity 260ms ease, transform 260ms ease' : 'none';
      icon.style.opacity = String(progress);
      icon.style.transform = `scale(${0.7 + 0.3 * progress})`;
    }
  }, []);

  // Stay open while refreshing; close smoothly when it's done.
  useEffect(() => {
    refreshing.current = isRefreshing;
    paint(isRefreshing ? HOLD : 0, true);
  }, [isRefreshing, paint]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const reset = () => {
    startY.current = null;
    pull.current = 0;
    cancelAnimationFrame(frame.current);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    reset();
    if (enabled && !isRefreshing && getScrollTop() <= 0) startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    // Scrolling the list (or pushing back up) cancels the pull.
    if (getScrollTop() > 0 || dy <= 0) {
      if (pull.current > 0) paint(0, true);
      if (getScrollTop() > 0) startY.current = null;
      pull.current = 0;
      return;
    }
    pull.current = resist(dy);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => paint(pull.current, false));
  };

  const onTouchEnd = () => {
    if (startY.current === null) return;
    const pulled = pull.current;
    reset();
    if (pulled >= TRIGGER && !isRefreshing) {
      paint(HOLD, true);
      // If the page never reports a refresh (e.g. one was already running),
      // close once it settles instead of staying open.
      Promise.resolve(onRefresh()).finally(() => {
        if (!refreshing.current) paint(0, true);
      });
    } else {
      paint(0, true);
    }
  };

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    indicator: (
      <div
        ref={indicatorRef}
        aria-hidden
        className="flex shrink-0 items-center justify-center overflow-hidden bg-black"
        style={{ height: 0 }}
      >
        <div ref={iconRef} style={{ opacity: 0 }}>
          <HoppingLogo size={26} animate={isRefreshing} />
        </div>
      </div>
    ),
  };
}
