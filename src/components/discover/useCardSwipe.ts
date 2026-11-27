import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Swipe-card gesture core for Discover. One implementation shared by touch,
 * mouse, pen and keyboard (Pointer Events), so the thresholds, fly-out and
 * snap-back are identical no matter how the card is moved.
 *
 * Platform rules (iOS WKWebView + Android System WebView):
 *  - the dragged element must have `touch-action: none` so neither browser
 *    steals the gesture for scrolling
 *  - a touch that starts within EDGE_GUARD px of the left/right screen edge is
 *    ignored, so the iOS edge swipe-back and Android gesture-nav keep working
 *  - touch pointers are captured implicitly by the browser; the mouse is captured
 *    explicitly, and only once a real drag begins (> CAPTURE_SLOP px), so plain
 *    taps still reach controls inside the card (photo taps, buttons)
 *  - pointercancel always snaps the card back (do NOT listen to lostpointercapture:
 *    releasing the implicit touch capture fires it and would cancel every drag)
 *
 * Performance model (unchanged from the previous inline version):
 *  - the card transform AND the heart/X stamps are written straight to the DOM
 *    inside a single requestAnimationFrame per frame - never through React state
 *  - React only hears about coarse changes (drag started/ended, direction
 *    flipped) through `onUiChange`, so the large Discover page does not
 *    re-render on every pointer move
 */

export type SwipeDir = 'left' | 'right';

export const CARD_EXIT_MS = 520;
/**
 * The throw: a short push in the swipe direction, then gravity takes over and the card tips over and falls completely
 * out of view. Starts with momentum (not a standing start) and accelerates - the opposite of the old ease-out, which
 * slowed down at the end and read as the card fading away.
 */
export const CARD_EXIT_EASE = 'cubic-bezier(0.38, 0.1, 0.72, 0.5)';
export const CARD_REST_TRANSFORM = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SNAP_BACK = `transform 0.35s ${EASE_OUT}`;
const EDGE_GUARD = 16; // px - screen-edge strip left to the OS back gesture
const CAPTURE_SLOP = 6; // px of movement before the pointer is captured
const HOLD_SAFETY_MS = 2500; // longest a committed card waits for the parent to swap in the next one

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/** Horizontal distance that registers as a deliberate swipe on release. */
export function minSwipeDistance(viewportWidth: number, source: 'touch' | 'mouse'): number {
  return source === 'mouse' ? 80 : Math.min(viewportWidth * 0.25, 120);
}

/**
 * Decide what a released drag means: 'left' / 'right' to commit, or null to
 * snap back. A quick flick commits even when it did not travel far.
 */
export function decideSwipe(opts: {
  deltaX: number;
  vx: number; // px/ms, smoothed
  viewportWidth: number;
  source: 'touch' | 'mouse';
}): SwipeDir | null {
  const { deltaX, vx, viewportWidth, source } = opts;
  const farEnough = Math.abs(deltaX) > minSwipeDistance(viewportWidth, source);
  const isFlick = Math.abs(vx) > 0.6 && Math.abs(deltaX) > 40 && Math.sign(vx) === Math.sign(deltaX);
  if (!farEnough && !isFlick) return null;
  return deltaX > 0 ? 'right' : 'left';
}

/** Transform for the card while it follows the finger (free in both axes). */
export function dragTransform(dx: number, dy: number): string {
  return `translate3d(${dx}px, ${dy}px, 0) rotate(${dx * 0.06}deg) scale(1)`;
}

/** Transform for the fly-away. `reduced` = plain slide + fade, no tilt/shrink. */
export function exitTransform(dir: SwipeDir, vw: number, vh: number, reduced = false): string {
  if (reduced) return `translate3d(${dir === 'right' ? vw * 1.5 : -vw * 1.5}px, 0, 0) rotate(0deg) scale(1)`;
  // Drifts out sideways while it drops past the bottom of the screen, tipping as it goes. Same size all the way
  // down (no shrinking), so it visibly falls instead of dissolving.
  const x = dir === 'right' ? vw * 0.85 : -vw * 0.85;
  const y = vh * 1.25;
  const rot = dir === 'right' ? 32 : -32;
  return `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(0.96)`;
}

/**
 * Stamp (heart / X) look for a given horizontal drag distance. Grows and
 * brightens continuously with the drag, so it reads as feedback and not as a
 * switch that flips on.
 */
export function stampLook(dist: number, dir: SwipeDir): { opacity: number; transform: string } {
  const p = Math.min(Math.abs(dist) / 100, 0.8);
  const scale = Math.min(0.85 + p * 0.5, 1.35);
  const rot = (dir === 'right' ? 1 : -1) * Math.abs(dist) * 0.08;
  return { opacity: Math.min(0.55 + p, 1), transform: `scale(${scale}) rotate(${rot}deg)` };
}

function setStamp(el: HTMLElement | null | undefined, look: { opacity: number; transform: string } | null) {
  if (!el) return;
  if (look) {
    el.style.opacity = String(look.opacity);
    el.style.transform = look.transform;
  } else {
    el.style.opacity = '0';
  }
}

function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'reduced') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface SwipeUiPatch {
  isDragging?: boolean;
  swipeDirection?: SwipeDir | null;
  swipeDistance?: number;
}

interface Options {
  /** The element that moves with the finger. */
  cardRef: React.RefObject<HTMLElement>;
  /** Heart shown while dragging right / X shown while dragging left (optional). */
  likeStampRef?: React.RefObject<HTMLElement>;
  passStampRef?: React.RefObject<HTMLElement>;
  /** True while something else (e.g. the report modal) must own touches. */
  isBlocked: () => boolean;
  /** Coarse UI state for the surrounding page (wrap in startTransition). */
  onUiChange: (patch: SwipeUiPatch) => void;
  /** A committed card started flying away / finished and was handed on. */
  onExitStart: (dir: SwipeDir) => void;
  onExitEnd: () => void;
  /** The fly-away finished: perform the like / pass. */
  onCommit: (dir: SwipeDir) => void;
  /**
   * Keep the card off-screen after onCommit instead of snapping it back to rest.
   * For decks whose parent advances asynchronously (it waits on the network, then swaps
   * in the next card): the old card must not flash back first. If the parent never
   * advances (limit reached, error) call `restore()` to bring the card back.
   */
  holdAfterCommit?: boolean;
}

export function useCardSwipe(options: Options) {
  // Latest options without re-creating handlers (the page re-renders a lot).
  const opts = useRef(options);
  useLayoutEffect(() => {
    opts.current = options;
  });

  const settleTimer = useRef<number | null>(null);
  const restoreRef = useRef<(() => void) | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const delta = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const exiting = useRef(false);
  const rafId = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);
  const lastPushed = useRef<{ dir: SwipeDir | null; dist: number }>({ dir: null, dist: 0 });
  const velocity = useRef({ lastX: 0, lastT: 0, vx: 0 });
  const maxMove = useRef(0);
  const sourceRef = useRef<'touch' | 'mouse'>('touch');
  const pointerId = useRef<number | null>(null);
  const captured = useRef(false);

  const cancelFrame = () => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };

  const snapBack = () => {
    const card = opts.current.cardRef.current;
    if (!card) return;
    card.style.transition = SNAP_BACK;
    card.style.transform = CARD_REST_TRANSFORM;
  };

  const begin = (x: number, y: number, t: number, source: 'touch' | 'mouse') => {
    if (opts.current.isBlocked() || exiting.current) return false;
    sourceRef.current = source;
    start.current = { x, y };
    delta.current = { x: 0, y: 0 };
    maxMove.current = 0;
    velocity.current = { lastX: x, lastT: t, vx: 0 };
    // Drop any snap-back still easing so the card tracks the finger 1:1.
    const card = opts.current.cardRef.current;
    if (card) card.style.transition = 'none';
    dragging.current = true;
    lastPushed.current = { dir: null, dist: 0 };
    opts.current.onUiChange({ isDragging: true, swipeDirection: null, swipeDistance: 0 });
    return true;
  };

  const move = (x: number, y: number, t: number) => {
    if (!dragging.current) return;
    const vel = velocity.current;
    const dt = t - vel.lastT;
    if (dt > 0) {
      vel.vx = 0.8 * ((x - vel.lastX) / dt) + 0.2 * vel.vx;
      vel.lastX = x;
      vel.lastT = t;
    }
    delta.current = { x: x - start.current.x, y: y - start.current.y };
    maxMove.current = Math.max(maxMove.current, Math.abs(delta.current.x), Math.abs(delta.current.y));
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      // The drag may have ended (and an exit started) before this frame ran;
      // writing now would stomp the exit transform.
      if (!dragging.current) return;
      const { x: dx, y: dy } = delta.current;
      const o = opts.current;
      if (o.cardRef.current) o.cardRef.current.style.transform = dragTransform(dx, dy);

      const dir: SwipeDir = dx > 0 ? 'right' : 'left';
      const dist = Math.abs(dx);
      // Stamps follow the finger every frame, straight on the DOM.
      setStamp(o.likeStampRef?.current, dir === 'right' ? stampLook(dist, 'right') : null);
      setStamp(o.passStampRef?.current, dir === 'left' ? stampLook(dist, 'left') : null);

      // Coarse React updates: only when the direction flips or the distance
      // moved meaningfully while the overlays can still change (< ~112px).
      const lp = lastPushed.current;
      if (dir !== lp.dir || (Math.abs(dist - lp.dist) > 16 && Math.min(dist, lp.dist) < 112)) {
        lastPushed.current = { dir, dist };
        o.onUiChange({ swipeDirection: dir, swipeDistance: dist });
      }
    });
  };

  const resetStamps = useCallback(() => {
    const o = opts.current;
    setStamp(o.likeStampRef?.current, null);
    setStamp(o.passStampRef?.current, null);
  }, []);

  /** Fly the card away in `dir`, then hand the decision to the page. */
  const flyOut = useCallback((dir: SwipeDir) => {
    if (exiting.current) return;
    exiting.current = true;
    const o = opts.current;
    const reduced = prefersReducedMotion();
    const ms = reduced ? 140 : CARD_EXIT_MS;
    const card = o.cardRef.current;
    if (card) {
      // Written directly: the live transform was set imperatively, so React's
      // own style update alone can land a frame late and the card would spring
      // back to centre before vanishing.
      card.style.transition = reduced ? `transform ${ms}ms ease-out, opacity ${ms}ms ease-out` : `transform ${ms}ms ${CARD_EXIT_EASE}`;
      card.style.transform = exitTransform(dir, window.innerWidth, window.innerHeight, reduced);
      if (reduced) card.style.opacity = '0';
    }
    resetStamps();
    o.onExitStart(dir);
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null;
      const cur = opts.current;
      cur.onCommit(dir);
      if (cur.holdAfterCommit) {
        // Card stays gone until the parent swaps it (settle()) or restore() runs. Safety net: if the parent never
        // advances, bring the card back rather than leaving an empty screen.
        settleTimer.current = window.setTimeout(() => {
          settleTimer.current = null;
          if (exiting.current) restoreRef.current?.();
        }, HOLD_SAFETY_MS);
        return;
      }
      // Reset the (reused) card in place so the next profile appears without
      // flying in from off-screen.
      const c = cur.cardRef.current;
      if (c) {
        c.style.transition = 'none';
        c.style.transform = CARD_REST_TRANSFORM;
        c.style.opacity = '';
      }
      cur.onExitEnd();
      exiting.current = false;
    }, ms);
  }, [resetStamps]);

  /**
   * With `holdAfterCommit`: the parent has swapped in the next card - put the (reused) element back at
   * rest instantly, with no transition, so the new card appears in place the same frame it renders.
   * Safe to call at any time; does nothing unless a swipe is waiting to be handed on.
   */
  const settle = useCallback(() => {
    if (!exiting.current) return;
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    const cur = opts.current;
    const c = cur.cardRef.current;
    if (c) {
      c.style.transition = 'none';
      c.style.transform = CARD_REST_TRANSFORM;
      c.style.opacity = '';
      // Make the browser register this jump BEFORE onExitEnd lets React put the card's transition back; otherwise
      // both land in one style recalc and the card slides in from off-screen instead of appearing in place.
      void c.offsetWidth;
    }
    cur.onExitEnd();
    exiting.current = false;
  }, []);

  /** Bring a held (flown-away) card back to rest - used when the parent did not advance. */
  const restore = useCallback(() => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    const o = opts.current;
    const c = o.cardRef.current;
    if (c) {
      c.style.transition = `transform 0.35s ${EASE_OUT}, opacity 0.2s ease-out`;
      c.style.transform = CARD_REST_TRANSFORM;
      c.style.opacity = '';
    }
    o.onExitEnd();
    exiting.current = false;
  }, []);
  useLayoutEffect(() => {
    restoreRef.current = restore;
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, [restore]);

  const finish = (endX: number, source: 'touch' | 'mouse') => {
    if (!dragging.current) return;
    dragging.current = false;
    cancelFrame(); // a frame left queued would overwrite the exit transform
    lastPushed.current = { dir: null, dist: 0 };
    delta.current = { x: 0, y: 0 };
    const o = opts.current;
    const dir = decideSwipe({
      deltaX: endX - start.current.x,
      vx: velocity.current.vx,
      viewportWidth: window.innerWidth,
      source,
    });
    o.onUiChange({ isDragging: false, swipeDirection: null, swipeDistance: 0 });
    if (dir) {
      flyOut(dir);
    } else {
      resetStamps();
      snapBack();
    }
  };

  const cancel = () => {
    if (!dragging.current) return;
    dragging.current = false;
    cancelFrame();
    lastPushed.current = { dir: null, dist: 0 };
    delta.current = { x: 0, y: 0 };
    resetStamps();
    snapBack();
    opts.current.onUiChange({ isDragging: false, swipeDirection: null, swipeDistance: 0 });
  };

  // ---- pointer (touch, mouse, pen) ----------------------------------------
  const releaseCapture = (el: Element | null, id: number | null) => {
    if (!el || id === null || !captured.current) return;
    try {
      if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    } catch {
      /* already released */
    }
    captured.current = false;
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!e.isPrimary || pointerId.current !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'touch') {
      const w = window.innerWidth;
      if (e.clientX < EDGE_GUARD || e.clientX > w - EDGE_GUARD) return;
    }
    if (!begin(e.clientX, e.clientY, e.timeStamp, e.pointerType === 'mouse' ? 'mouse' : 'touch')) return;
    pointerId.current = e.pointerId;
    captured.current = false;
  }, []);  

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerId !== pointerId.current) return;
    if (e.pointerType === 'mouse' && !captured.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > CAPTURE_SLOP) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
        captured.current = true;
      } catch {
        /* capture is best-effort */
      }
    }
    move(e.clientX, e.clientY, e.timeStamp);
  }, []);  

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    releaseCapture(e.currentTarget, e.pointerId);
    finish(e.clientX, sourceRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The browser/OS took the gesture over (system gesture, incoming call, capture lost):
  // there is no pointerup, so snap back instead of leaving the card stuck mid-drag.
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    releaseCapture(e.currentTarget, e.pointerId);
    cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Never leave frames or timers behind.
  useEffect(
    () => () => {
      cancelFrame();
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    /** Same fly-away as a gesture - for keyboard / future buttons. */
    commitSwipe: useCallback(
      (dir: SwipeDir) => {
        if (dragging.current || opts.current.isBlocked()) return;
        flyOut(dir);
      },
      [flyOut],
    ),
    restore,
    settle,
    isExiting: () => exiting.current,
    /** True if the last gesture moved enough that a trailing click is not a tap. */
    didDrag: () => maxMove.current > 10,
  };
}
