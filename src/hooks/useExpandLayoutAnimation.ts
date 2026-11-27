import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Duration / easing shared with the CSS (see --dl-expand-ms / --dl-expand-ease in index.css). */
export const EXPAND_MS = 420;
export const EXPAND_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Smoothly animates a `.profile-info-layout` between collapsed and expanded.
 *
 * Why not a CSS transition on the element: the swipe code owns that element's inline `transition`
 * (it rewrites it for drags, fly-offs and snap-backs), and an inline transition always beats the
 * stylesheet - so the layout used to jump to its final size in one frame while only the text faded.
 * The Web Animations API runs independently of the element's `transition`, so it can't be overridden.
 *
 * Runs in a layout effect (after React updated the class, before paint): it reads the track sizes of
 * both states (the end state is the live one; the start state by flipping the class back and forth
 * inside the same frame - no paint happens in between) and animates from -> to. Only fires on a
 * real change of `expanded`, never on first mount, and not for users who prefer reduced motion.
 */
export function useExpandLayoutAnimation(layoutRef: RefObject<HTMLElement | null>, expanded: boolean): void {
  const prev = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const el = layoutRef.current;
    const was = prev.current;
    prev.current = expanded;
    if (!el || was === null || was === expanded) return;
    if (typeof el.animate !== 'function') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Interrupted mid-flight (tapped again before it finished)? Start from where it currently is, so the
    // card reverses smoothly instead of jumping to the old end state first.
    const running = el.getAnimations().find((a) => (a as { id?: string }).id === 'dl-expand' && a.playState === 'running');
    let from: string | null = running ? getComputedStyle(el).gridTemplateRows : null;
    running?.cancel();

    const to = getComputedStyle(el).gridTemplateRows;
    if (!from) {
      el.classList.toggle('is-expanded');
      from = getComputedStyle(el).gridTemplateRows;
      el.classList.toggle('is-expanded');
    }

    // Only animate real px track lists (side-by-side landscape layout has a single row: nothing to do).
    if (!from || !to || from === to || !/px/.test(from) || !/px/.test(to)) return;

    const anim = el.animate(
      [{ gridTemplateRows: from }, { gridTemplateRows: to }],
      { duration: EXPAND_MS, easing: EXPAND_EASING }
    );
    anim.id = 'dl-expand';
  }, [expanded, layoutRef]);
}
