import { useSyncExternalStore } from 'react';
import { isBoostPreview } from '@/services/boost';

/**
 * Where the DripCheck Boost button is and how loud it is. One shared state: the button remounts with every card.
 *
 *  rest  -> small and still, under the report button at the top right of the card (always there)
 *  drop  -> "show-off": drops from the rest spot to the showcase spot above the expand button (DROP_MS, small settle)
 *  spin  -> at the showcase spot, full size, turning with its glow (SPIN_MS)
 *  hold  -> still at the showcase spot (HOLD_MS)
 *  rise  -> glides back up to the rest spot and shrinks (RISE_MS)
 *
 * A show-off plays after FIRST_SWIPES committed swipes, then every REPEAT_SWIPES swipes or REPEAT_MS (whichever comes
 * first) - only while a boost can be started (never while one runs, never once today's free boost is used), never
 * while a card is dragged, the details panel is open, the app is in the background, or with reduced motion.
 * Only phase changes use timers; all motion is CSS transform / opacity (boost.css).
 */
export type BoostPhase = 'rest' | 'drop' | 'spin' | 'hold' | 'rise';

const FIRST_SWIPES = 9;
const REPEAT_SWIPES = 12;
const REPEAT_MS = 5 * 60_000;
export const DROP_MS = 700;
const SPIN_MS = 3000;
const HOLD_MS = 10_000;
export const RISE_MS = 650;

let phase: BoostPhase = 'rest';
let phaseAt = 0;
/** rest spot -> showcase spot, measured when a show-off starts */
let offset = { x: 0, y: 0 };
let swipesSince = 0;
let threshold = FIRST_SWIPES;
let pending = false;
let eligible = false; // a boost can be started right now
let detailsOpen = false;
let showcase: (() => { x: number; y: number } | null) | null = null;

let phaseTimer: ReturnType<typeof setTimeout> | null = null;
let repeatTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const reducedMotion = () => {
  try {
    return document.documentElement.getAttribute('data-motion') === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const dragging = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-dl-swiping');
const docHidden = () => typeof document !== 'undefined' && document.hidden;

function setPhase(next: BoostPhase, after?: { ms: number; then: () => void }) {
  if (phaseTimer) clearTimeout(phaseTimer);
  phaseTimer = null;
  phase = next;
  phaseAt = Date.now();
  if (after) phaseTimer = setTimeout(after.then, after.ms);
  emit();
}

function armRepeat() {
  if (repeatTimer) clearTimeout(repeatTimer);
  repeatTimer = setTimeout(() => {
    repeatTimer = null;
    requestShowOff();
  }, REPEAT_MS);
}

function backToRest(animate = true) {
  if (phase === 'rest') return;
  swipesSince = 0;
  threshold = REPEAT_SWIPES;
  armRepeat();
  if (animate && !reducedMotion()) setPhase('rise', { ms: RISE_MS, then: () => setPhase('rest') });
  else setPhase('rest');
}

function requestShowOff() {
  if (phase !== 'rest' || !eligible) return;
  if (!showcase || detailsOpen || dragging() || docHidden() || reducedMotion()) {
    pending = true;
    return;
  }
  const to = showcase();
  if (!to || (Math.abs(to.x) < 4 && Math.abs(to.y) < 4)) {
    pending = true;
    return;
  }
  pending = false;
  offset = to;
  setPhase('drop', {
    ms: DROP_MS,
    then: () => setPhase('spin', { ms: SPIN_MS, then: () => setPhase('hold', { ms: HOLD_MS, then: () => backToRest() }) }),
  });
}

const retrySoon = (ms = 600) => setTimeout(() => {
  if (pending) requestShowOff();
}, ms);

/** One committed swipe on the DripCheck deck (called from the deck's commit). */
export function noteBoostSwipe() {
  swipesSince += 1;
  // the commit fires as the drag ends: let the next card settle first
  if (phase === 'rest' && (swipesSince >= threshold || pending)) {
    pending = true;
    retrySoon(500);
  }
}

/** Whether a show-off may play: a boost can be started (not running, not used up). Leaving it ends a show-off. */
export function setBoostShowOffAllowed(on: boolean) {
  eligible = on;
  if (!on) {
    pending = false;
    if (phase !== 'rest' && phase !== 'rise') backToRest(false);
  }
}

/** The details panel opened / closed: no show-off over it (a running one goes back up). */
export function setBoostDetailsOpen(open: boolean) {
  detailsOpen = open;
  if (open && (phase === 'drop' || phase === 'spin' || phase === 'hold')) backToRest();
  if (!open && pending) retrySoon(800);
}

/** The mounted button tells where its showcase spot is (offset from the rest spot); null when it unmounts. */
export function setBoostShowcase(fn: (() => { x: number; y: number } | null) | null) {
  showcase = fn;
  if (fn && pending) retrySoon(800);
}

/** Back to the rest spot at once (e.g. a tap that starts a boost). */
export function boostButtonToRest() {
  if (phase !== 'rest') backToRest(false);
}

export function useBoostPhase(): { phase: BoostPhase; phaseAt: number; offset: { x: number; y: number } } {
  const p = useSyncExternalStore(subscribe, () => phase, () => 'rest' as BoostPhase);
  return { phase: p, phaseAt, offset };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pending) retrySoon(1000);
  });
}

// QA (preview mode only): window.__dlBoostSwipes(n) counts n swipes; __dlBoostShowOff() plays a show-off now.
if (typeof window !== 'undefined' && isBoostPreview()) {
  const w = window as unknown as Record<string, unknown>;
  w.__dlBoostSwipes = (n = 1) => {
    for (let i = 0; i < n; i++) noteBoostSwipe();
    return { swipesSince, threshold, phase };
  };
  w.__dlBoostShowOff = () => {
    requestShowOff();
    return phase;
  };
}
