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

export const CARD_EXIT_MS = 620;
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
const HOLD_SAFETY_MS = 1200; // longest a committed card waits for the parent to swap in the next one

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/**
 * Horizontal distance that registers as a deliberate swipe on release: ~30% of the screen on touch (never under 100
 * or over 140 px) so a small nudge, a tap that wiggled, or a scroll never likes/passes anyone by accident.
 */
export function minSwipeDistance(viewportWidth: number, source: 'touch' | 'mouse'): number {
  return source === 'mouse' ? 100 : Math.min(Math.max(viewportWidth * 0.3, 100), 140);
}

/** A quick flick must still be a real gesture: fast, clearly sideways, and at least this far. */
const FLICK_MIN_DISTANCE = 70;
const FLICK_MIN_VELOCITY = 0.8; // px/ms

/**
 * Decide what a released drag means: 'left' / 'right' to commit, or null to snap back.
 * Rules (all must hold to commit): the move is mainly sideways (not a vertical drag / scroll), and it either went
 * far enough or was a fast flick that also travelled a real distance in the same direction.
 */
export function decideSwipe(opts: {
  deltaX: number;
  deltaY?: number;
  vx: number; // px/ms, smoothed
  viewportWidth: number;
  source: 'touch' | 'mouse';
}): SwipeDir | null {
  const { deltaX, deltaY = 0, vx, viewportWidth, source } = opts;
  const ax = Math.abs(deltaX);
  if (Math.abs(deltaY) > ax) return null; // mostly vertical: not a swipe
  const farEnough = ax > minSwipeDistance(viewportWidth, source);
  const isFlick = Math.abs(vx) > FLICK_MIN_VELOCITY && ax >= FLICK_MIN_DISTANCE && Math.sign(vx) === Math.sign(deltaX);
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

function lockStampEl(on: HTMLElement | null | undefined, off: HTMLElement | null | undefined, dir: SwipeDir) {
  setStamp(off, null);
  if (!on) return;
  on.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease-out';
  on.style.opacity = '1';
  on.style.transform = `scale(1.3) rotate(${dir === 'right' ? 8 : -8}deg)`;
}

/** Marks the page as mid-swipe so decorative loops (card background icons) pause and cannot cost frames. */
function setSwiping(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.setAttribute('data-dl-swiping', '');
  else document.documentElement.removeAttribute('data-dl-swiping');
}

/**
 * The falling card is a throwaway copy ("ghost") of the live card, so the live card is free at once: the next profile
 * is in place immediately and can be swiped straight away while earlier cards are still dropping off-screen.
 * Returns null when a copy cannot be made (the caller then falls back to animating the live card itself).
 */
let ghostStyleAdded = false;
/**
 * Keep the falling copy cheap: it only has to LOOK like the card for half a second. Images that are not on screen
 * (other photos in the carousel) are dropped so they are not decoded/painted again, and blur / animation effects are
 * switched off so the copy is a flat layer the GPU just moves.
 */
function slimGhost(card: HTMLElement, ghost: HTMLElement) {
  if (!ghostStyleAdded) {
    ghostStyleAdded = true;
    const st = document.createElement('style');
    st.textContent =
      // `filter` is kept: the photo's soft reflection and backdrop are blurred with it, and stripping it made the card
      // visibly change (sharp mirrored bands) the instant it was let go. A static blur inside a layer that is only
      // moved is drawn once, not per frame; backdrop-filter re-samples what is behind it every frame, so that goes.
      '.dl-card-ghost,.dl-card-ghost *{animation:none!important;transition:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
      '.dl-card-ghost video,.dl-card-ghost canvas{display:none!important}';
    document.head.appendChild(st);
  }
  ghost.classList.add('dl-card-ghost');
  try {
    const bounds = card.getBoundingClientRect();
    const src = card.querySelectorAll('img');
    const dst = ghost.querySelectorAll('img');
    if (src.length === dst.length) {
      src.forEach((img, i) => {
        const r = img.getBoundingClientRect();
        const visible = r.right > bounds.left + 4 && r.left < bounds.right - 4 && r.bottom > bounds.top + 4 && r.top < bounds.bottom - 4;
        if (!visible) dst[i].remove();
      });
    }
  } catch {
    /* cosmetic only */
  }
}

/**
 * Chrome (Android WebView) only gives a NEW <img> element its pixels a task or more after it is created, even for a
 * photo already on screen, unless that URL was loaded by an image request moments before; WebKit (iOS) serves it from
 * memory at once. Without this, the falling copy and the card that takes over each painted one or more black frames
 * on Android only. Loading the photos of the card in hand and of the card waiting behind it through a plain Image()
 * when a drag starts makes every new copy of them complete immediately, so both platforms show the same frames.
 * Only photos that are already loaded are touched (no new downloads); the last few are kept so they stay warm.
 */
const warmed = new Map<string, HTMLImageElement>();
function warmImages(roots: Array<ParentNode | null | undefined>) {
  if (typeof Image === 'undefined') return;
  for (const root of roots) {
    root?.querySelectorAll?.('img').forEach((img) => {
      const url = img.currentSrc || img.getAttribute('src');
      if (!url || !img.complete || !img.naturalWidth) return;
      const prev = warmed.get(url);
      warmed.delete(url);
      if (prev) {
        warmed.set(url, prev);
        return;
      }
      const w = new Image();
      w.decoding = 'async';
      w.src = url;
      warmed.set(url, w);
    });
  }
  while (warmed.size > 16) warmed.delete(warmed.keys().next().value as string);
}

/**
 * The card waiting behind (NextCardPreview) rests smaller, blurred and dimmed, and is meant to be at full size and
 * sharp the instant a swipe commits. The page's own re-render for that is low priority and often lands only after
 * the next card has already taken over, so for a frame or two the waiting card showed small and blurred and then
 * jumped. Reveal it here on the DOM in the same frame the card is thrown; returns an undo that puts back exactly
 * what the page had written (used when the swipe is handed on or refused).
 */
function revealPreviews(card: HTMLElement): (() => void) | null {
  const els = card.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-next-card-preview]');
  if (!els || els.length === 0) return null;
  const saved: Array<[HTMLElement, 'transform' | 'borderRadius' | 'filter' | 'opacity', string]> = [];
  const set = (el: HTMLElement | null, prop: 'transform' | 'borderRadius' | 'filter' | 'opacity', value: string) => {
    if (!el) return;
    saved.push([el, prop, el.style[prop]]);
    el.style[prop] = value;
  };
  els.forEach((el) => {
    set(el, 'transform', 'scale(1)');
    set(el, 'borderRadius', el.dataset.revealedRadius || '0px');
    set(el.querySelector<HTMLElement>(':scope > [data-ncp-blur]'), 'filter', 'none');
    set(el.querySelector<HTMLElement>(':scope > [data-ncp-tint]'), 'opacity', '0');
  });
  return () => {
    for (let i = saved.length - 1; i >= 0; i--) {
      const [el, prop, value] = saved[i];
      el.style[prop] = value;
    }
  };
}

function launchGhost(card: HTMLElement, from: string, to: string, ms: number, ghosts: Set<HTMLElement>, detach: boolean): HTMLElement | null {
  const parent = detach ? document.body : card.parentElement;
  if (!parent || typeof card.cloneNode !== 'function') return null;
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  slimGhost(card, ghost);
  const st = ghost.style;
  if (detach) {
    // Lives on <body> so it survives the page replacing the card (e.g. a re-keyed component). Measure the card
    // where it rests (transform off) so the ghost lines up exactly.
    const live = card.style.transform;
    card.style.transform = 'none';
    const r = card.getBoundingClientRect();
    card.style.transform = live;
    st.position = 'fixed';
    st.left = `${r.left}px`;
    st.top = `${r.top}px`;
    st.width = `${r.width}px`;
    st.height = `${r.height}px`;
    st.zIndex = '9999';
  } else {
    st.position = 'absolute';
    st.left = `${card.offsetLeft}px`;
    st.top = `${card.offsetTop}px`;
    st.width = `${card.offsetWidth}px`;
    st.height = `${card.offsetHeight}px`;
    st.zIndex = '12';
  }
  st.margin = '0';
  st.pointerEvents = 'none';
  st.visibility = 'visible';
  st.opacity = '';
  st.transition = 'none';
  st.transform = from;
  if (detach) parent.appendChild(ghost);
  else parent.insertBefore(ghost, card.nextSibling);
  ghosts.add(ghost);
  const remove = () => {
    ghosts.delete(ghost);
    ghost.remove();
  };
  // Web Animations drive the fall: runs on the compositor and starts on the very next frame, with no reliance on a
  // forced reflow to separate "start" from "end" the way a CSS transition needs.
  if (typeof ghost.animate === 'function') {
    try {
      const anim = ghost.animate([{ transform: from }, { transform: to }], { duration: ms, easing: CARD_EXIT_EASE, fill: 'forwards' });
      anim.onfinish = remove;
    } catch {
      st.transform = to;
    }
  } else {
    st.transform = to;
  }
  window.setTimeout(remove, ms + 80);
  return ghost;
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
  /** The page replaces the card element when the next profile arrives: let the falling copy live on <body>. */
  detachGhost?: boolean;
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
  const ghosts = useRef<Set<HTMLElement>>(new Set());
  const previewUndo = useRef<(() => void) | null>(null);
  const undoPreviewReveal = () => {
    const undo = previewUndo.current;
    previewUndo.current = null;
    undo?.();
  };

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
    if (card) {
      card.style.transition = 'none';
      try {
        warmImages([card, ...Array.from(card.parentElement?.querySelectorAll('[data-next-card-preview]') ?? [])]);
      } catch {
        /* cosmetic only */
      }
    }
    dragging.current = true;
    setSwiping(true);
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
    setSwiping(false);
    const o = opts.current;
    for (const el of [o.likeStampRef?.current, o.passStampRef?.current]) {
      if (el) el.style.transition = 'none';
    }
    setStamp(o.likeStampRef?.current, null);
    setStamp(o.passStampRef?.current, null);
  }, []);

  /** While the card falls, the decision stays on it at full strength (heart = like, X = pass) so it is always clear what was chosen. */
  const lockStamp = useCallback((dir: SwipeDir) => {
    const o = opts.current;
    lockStampEl(dir === 'right' ? o.likeStampRef?.current : o.passStampRef?.current, dir === 'right' ? o.passStampRef?.current : o.likeStampRef?.current, dir);
  }, []);

  /** Fly the card away in `dir`, then hand the decision to the page. */
  const flyOut = useCallback((dir: SwipeDir) => {
    if (exiting.current) return;
    exiting.current = true;
    const o = opts.current;
    const reduced = prefersReducedMotion();
    const ms = reduced ? 140 : CARD_EXIT_MS;
    const card = o.cardRef.current;
    const liveTransform = card?.style.transform || CARD_REST_TRANSFORM; // where the finger left the card
    if (card) {
      // Written directly: the live transform was set imperatively, so React's
      // own style update alone can land a frame late and the card would spring
      // back to centre before vanishing.
      card.style.transition = reduced ? `transform ${ms}ms ease-out, opacity ${ms}ms ease-out` : `transform ${ms}ms ${CARD_EXIT_EASE}`;
      card.style.transform = exitTransform(dir, window.innerWidth, window.innerHeight, reduced);
      if (reduced) card.style.opacity = '0';
    }
    lockStamp(dir);
    if (card) {
      undoPreviewReveal();
      try {
        previewUndo.current = revealPreviews(card);
      } catch {
        /* cosmetic only */
      }
    }
    o.onExitStart(dir);

    // Fast path: drop a copy of the card and hand the decision on straight away.
    if (card && !reduced) {
      const from = liveTransform;
      const ghost = launchGhost(card, from, exitTransform(dir, window.innerWidth, window.innerHeight), ms, ghosts.current, !!o.detachGhost);
      if (ghost) {
        card.style.visibility = 'hidden';
        card.style.transition = 'none';
        card.style.transform = CARD_REST_TRANSFORM;
        resetStamps(); // the live card's heart / X start clean for the next profile
        // Let the first frame of the fall paint BEFORE the page does its (heavy) re-render for the next profile,
        // so the drop starts instantly and the main thread is free for the next touch as soon as possible.
        requestAnimationFrame(() => {
          exitTimer.current = window.setTimeout(() => {
            exitTimer.current = null;
            opts.current.onCommit(dir);
            // The parent swaps in the next card (settle()); if it never does (limit reached, error) bring the card back.
            settleTimer.current = window.setTimeout(() => {
              settleTimer.current = null;
              if (exiting.current) restoreRef.current?.();
            }, HOLD_SAFETY_MS);
          }, 0);
        });
        return;
      }
    }

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
      resetStamps();
      if (c) {
        c.style.transition = 'none';
        c.style.transform = CARD_REST_TRANSFORM;
        c.style.opacity = '';
      }
      undoPreviewReveal();
      cur.onExitEnd();
      exiting.current = false;
    }, ms);
  }, [resetStamps, lockStamp]);

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
    resetStamps();
    if (c) {
      c.style.transition = 'none';
      c.style.transform = CARD_REST_TRANSFORM;
      c.style.opacity = '';
      c.style.visibility = '';
      // Make the browser register this jump BEFORE onExitEnd lets React put the card's transition back; otherwise
      // both land in one style recalc and the card slides in from off-screen instead of appearing in place.
      void c.offsetWidth;
    }
    undoPreviewReveal();
    cur.onExitEnd();
    exiting.current = false;
  }, [resetStamps]);

  /** Bring a held (flown-away) card back to rest - used when the parent did not advance. */
  const restore = useCallback(() => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    const o = opts.current;
    const c = o.cardRef.current;
    resetStamps();
    if (c) {
      c.style.transition = `transform 0.35s ${EASE_OUT}, opacity 0.2s ease-out`;
      c.style.transform = CARD_REST_TRANSFORM;
      c.style.opacity = '';
      c.style.visibility = '';
    }
    undoPreviewReveal();
    o.onExitEnd();
    exiting.current = false;
  }, [resetStamps]);
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
    const endDy = delta.current.y;
    delta.current = { x: 0, y: 0 };
    const o = opts.current;
    const dir = decideSwipe({
      deltaX: endX - start.current.x,
      deltaY: endDy,
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
      setSwiping(false);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
      ghosts.current.forEach((g) => { if (g.parentElement !== document.body) g.remove(); });
      ghosts.current.clear();
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
