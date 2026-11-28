import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { endBoostLaunch, markBoostLaunchArrived, type BoostLaunch } from '@/services/boost';
import { BoostBolt, prefersReducedMotion } from './BoostBolt';
import { BOOST_REST_SCALE } from './BoostButton';

/** The bolt spins in and the copy lands by INTRO; the message then stays up, fully readable, for HOLD (a tap skips it);
 *  then the bolt flies back into the card's Boost button, landing at ARRIVE_AT. */
const INTRO = 1560;
const HOLD = 5000;
const HOLD_END = INTRO + HOLD;
const ARRIVE_AT = HOLD_END + 400;
const TOTAL = ARRIVE_AT + 240;
const DISC = 96;
const SPARKS = 14;
const RINGS = 4;

/** Where the bolt lands: the Boost button's rest spot under the report button (the seal goes back there as a boost
 *  starts), else back where it came from. */
function landingPoint(from: BoostLaunch['from']): { x: number; y: number; size: number } {
  const r = document.querySelector('.dl-boost-btn')?.getBoundingClientRect();
  if (r && r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: 48 * BOOST_REST_SCALE };
  return { x: from.x, y: from.y, size: Math.max(30, from.size) };
}

/**
 * "Boost activated": the bolt leaves the button, slams into the middle of the screen, spins fast inside a burst of
 * glow, rings and sparks, a bold "Boost activated / Let's go for a ride" lands under it with a "working on it" line.
 * The message then stays up for ~5s so it can be read (the bar under it fills, the glow breathes; a tap skips ahead),
 * then the bolt shrinks and flies back into the card's Boost button, which pops in as it lands (its time-left ring and
 * the Boost sheet show the time in the app). Transform / opacity only (Web Animations API), identical on iOS and
 * Android; with reduced motion it is skipped.
 */
const BoostLaunchAnimation: React.FC<{ launch: BoostLaunch }> = ({ launch }) => {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    if (prefersReducedMotion() || typeof el.animate !== 'function') {
      markBoostLaunchArrived();
      endBoostLaunch();
      return undefined;
    }
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.4;
    const from = launch.from;
    const a = landingPoint(from);
    const s1 = a.size / DISC;
    const s0 = Math.max(0.2, from.size / DISC);
    const dx0 = from.x - cx;
    const dy0 = from.y - cy;
    const dx1 = a.x - cx;
    const dy1 = a.y - cy;
    const T = (x: number, y: number, rot: number, s: number) => `translate3d(${x}px, ${y}px, 0) perspective(700px) rotateY(${rot}deg) scale(${s})`;
    const o = (ms: number) => Math.min(1, Math.max(0, ms / TOTAL));
    const anims: Animation[] = [];
    // `easing` is per segment (between keyframes), never for the whole timeline: one curve over all of TOTAL would
    // warp every timestamp below (e.g. the veil would be gone while the message is still up).
    const run = (node: Element | null, frames: Keyframe[], easing = 'linear') => {
      if (node) anims.push((node as HTMLElement).animate(frames.map((f) => ({ easing, ...f })), { duration: TOTAL, fill: 'forwards' }));
    };

    // The bolt: in (0-300), fast spin x4 (300-1080), slam (1080-1200), floats gently through the hold, flies
    // into the card button (HOLD_END-ARRIVE_AT).
    run(el.querySelector('.bl-disc'), [
      { offset: 0, transform: T(dx0, dy0, 0, s0), opacity: 1, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      { offset: o(300), transform: T(0, 0, 0, 1.12), opacity: 1, easing: 'cubic-bezier(0.6, 0, 0.4, 1)' },
      { offset: o(1080), transform: T(0, 0, 1440, 1.0), opacity: 1, easing: 'cubic-bezier(0.2, 0, 0.2, 1)' },
      { offset: o(1170), transform: T(0, 0, 1440, 1.22), opacity: 1, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      { offset: o(1360), transform: T(0, 0, 1440, 1.0), opacity: 1, easing: 'ease-in-out' },
      { offset: o(INTRO + HOLD / 2), transform: T(0, -5, 1440, 1.04), opacity: 1, easing: 'ease-in-out' },
      { offset: o(HOLD_END), transform: T(0, -2, 1440, 1.06), opacity: 1, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)' },
      { offset: o(ARRIVE_AT), transform: T(dx1, dy1, 1440, s1), opacity: 1 },
      { offset: o(ARRIVE_AT + 80), transform: T(dx1, dy1, 1440, s1 * 0.85), opacity: 0 },
      { offset: 1, transform: T(dx1, dy1, 1440, s1 * 0.85), opacity: 0 },
    ]);

    // Glow: bursts in with the spin, flares at the slam, breathes softly through the hold, gone before the flight.
    run(el.querySelector('.bl-glow'), [
      { offset: 0, opacity: 0, transform: 'scale(0.3)' },
      { offset: o(320), opacity: 1, transform: 'scale(1.15)' },
      { offset: o(620), opacity: 0.7, transform: 'scale(0.95)' },
      { offset: o(900), opacity: 0.95, transform: 'scale(1.1)' },
      { offset: o(1170), opacity: 1, transform: 'scale(1.45)' },
      { offset: o(INTRO), opacity: 0.55, transform: 'scale(1.05)' },
      { offset: o(INTRO + HOLD / 2), opacity: 0.75, transform: 'scale(1.14)' },
      { offset: o(HOLD_END), opacity: 0.55, transform: 'scale(1.05)' },
      { offset: o(HOLD_END + 160), opacity: 0, transform: 'scale(0.5)' },
      { offset: 1, opacity: 0, transform: 'scale(0.5)' },
    ], 'ease-in-out');

    // A light streak that sweeps the disc while it spins (reads as speed).
    run(el.querySelector('.bl-flare'), [
      { offset: 0, opacity: 0, transform: 'rotate(0deg) scale(0.6)' },
      { offset: o(300), opacity: 0.9, transform: 'rotate(0deg) scale(1)' },
      { offset: o(1080), opacity: 0.9, transform: 'rotate(900deg) scale(1)' },
      { offset: o(1250), opacity: 0, transform: 'rotate(1000deg) scale(1.4)' },
      { offset: 1, opacity: 0, transform: 'rotate(1000deg) scale(1.4)' },
    ]);

    run(el.querySelector('.bl-veil'), [
      { offset: 0, opacity: 0 },
      { offset: o(260), opacity: 1 },
      { offset: o(HOLD_END + 80), opacity: 1 },
      { offset: o(ARRIVE_AT + 120), opacity: 0 },
      { offset: 1, opacity: 0 },
    ], 'ease-out');

    // Shock rings: three during the spin, one big one at the slam.
    Array.from(el.querySelectorAll('.bl-ring')).forEach((ring, i) => {
      const start = i < RINGS - 1 ? 300 + i * 220 : 1120;
      const big = i === RINGS - 1;
      run(ring, [
        { offset: 0, opacity: 0, transform: 'scale(0.8)' },
        { offset: o(start), opacity: 0, transform: 'scale(0.8)' },
        { offset: o(start + 50), opacity: 1, transform: 'scale(1)' },
        { offset: o(start + (big ? 620 : 560)), opacity: 0, transform: `scale(${big ? 3.6 : 2.6})` },
        { offset: 1, opacity: 0, transform: `scale(${big ? 3.6 : 2.6})` },
      ], 'cubic-bezier(0.22, 1, 0.36, 1)');
    });

    // Sparks: one burst as the spin starts, a second at the slam.
    Array.from(el.querySelectorAll('.bl-spark')).forEach((spark, i) => {
      const second = i % 2 === 1;
      const ang = (i / SPARKS) * Math.PI * 2 + (second ? 0.22 : 0);
      const dist = (second ? 150 : 115) + (i % 3) * 16;
      const x = Math.cos(ang) * dist;
      const y = Math.sin(ang) * dist;
      const start = second ? 1130 : 320 + (i % 4) * 30;
      run(spark, [
        { offset: 0, opacity: 0, transform: 'translate3d(0,0,0) scale(0.4)' },
        { offset: o(start), opacity: 0, transform: 'translate3d(0,0,0) scale(0.4)' },
        { offset: o(start + 50), opacity: 1, transform: `translate3d(${x * 0.4}px, ${y * 0.4}px, 0) scale(1.2)` },
        { offset: o(start + 560), opacity: 0, transform: `translate3d(${x}px, ${y}px, 0) scale(0.4)` },
        { offset: 1, opacity: 0, transform: `translate3d(${x}px, ${y}px, 0) scale(0.4)` },
      ], 'cubic-bezier(0.22, 1, 0.36, 1)');
    });

    // Copy: the headline punches in at the slam, the lines follow, they stay up through the hold, all leave as the
    // bolt flies.
    const textIn = (sel: string, at: number, punch = false) =>
      run(el.querySelector(sel), [
        { offset: 0, opacity: 0, transform: punch ? 'translate3d(0, 0, 0) scale(1.35)' : 'translate3d(0, 12px, 0)' },
        { offset: o(at), opacity: 0, transform: punch ? 'translate3d(0, 0, 0) scale(1.35)' : 'translate3d(0, 12px, 0)', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        { offset: o(at + 220), opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        { offset: o(HOLD_END + 20), opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)', easing: 'ease-in' },
        { offset: o(HOLD_END + 200), opacity: 0, transform: 'translate3d(0, -10px, 0) scale(0.96)' },
        { offset: 1, opacity: 0, transform: 'translate3d(0, -10px, 0) scale(0.96)' },
      ]);
    textIn('.bl-title', 980, true);
    textIn('.bl-sub', 1120);
    textIn('.bl-work', 1220);
    // "working on it" bar: fills up over the hold (transform only), full just as the bolt leaves.
    run(el.querySelector('.bl-work-fill'), [
      { offset: 0, transform: 'scaleX(0)' },
      { offset: o(1300), transform: 'scaleX(0)' },
      { offset: o(HOLD_END), transform: 'scaleX(1)' },
      { offset: 1, transform: 'scaleX(1)' },
    ]);

    const burst = el.querySelector<HTMLElement>('.bl-burst');
    if (burst) {
      burst.style.left = `${a.x}px`;
      burst.style.top = `${a.y}px`;
      run(burst, [
        { offset: 0, opacity: 0, transform: 'scale(0.3)' },
        { offset: o(ARRIVE_AT - 30), opacity: 0, transform: 'scale(0.3)' },
        { offset: o(ARRIVE_AT + 30), opacity: 1, transform: 'scale(0.9)' },
        { offset: 1, opacity: 0, transform: 'scale(2.2)' },
      ], 'ease-out');
    }

    // Hand-off timers, measured from wherever the timeline is (a skip moves it forward).
    let arrive: ReturnType<typeof setTimeout> | undefined;
    let done: ReturnType<typeof setTimeout> | undefined;
    let release: ReturnType<typeof setTimeout> | undefined;
    const schedule = (at: number) => {
      clearTimeout(arrive);
      clearTimeout(done);
      clearTimeout(release);
      arrive = setTimeout(markBoostLaunchArrived, Math.max(0, ARRIVE_AT - 40 - at));
      done = setTimeout(endBoostLaunch, Math.max(0, TOTAL + 30 - at));
      // Taps go back to the app once the bolt has landed (never mid-tap, so a skip tap cannot fall through).
      release = setTimeout(() => el.removeAttribute('data-hold'), Math.max(0, ARRIVE_AT - at));
    };
    el.setAttribute('data-hold', '');
    schedule(0);

    // A tap (or Escape / Enter / Space) during the hold jumps straight to the flight into the card button.
    let skipped = false;
    const skip = () => {
      if (skipped) return;
      const at = Number(anims[0]?.currentTime ?? 0);
      // the intro (spin + slam) always plays; only the reading hold can be cut short
      if (at < 1300 || at >= HOLD_END) return;
      skipped = true;
      anims.forEach((an) => {
        an.currentTime = HOLD_END;
      });
      schedule(HOLD_END);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip();
    };
    el.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(arrive);
      clearTimeout(done);
      clearTimeout(release);
      el.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', onKey);
      anims.forEach((an) => {
        try {
          an.cancel();
        } catch {
          /* ignore */
        }
      });
    };
  }, [launch.id, launch.from]);

  return createPortal(
    <div ref={root} className="bl-root" aria-hidden="true">
      <div className="bl-veil" />
      <div className="bl-center">
        <div className="bl-glow" />
        {Array.from({ length: RINGS }, (_, i) => (
          <div key={i} className="bl-ring" data-big={i === RINGS - 1 ? 'true' : undefined} />
        ))}
        {Array.from({ length: SPARKS }, (_, i) => (
          <div key={i} className="bl-spark" data-alt={i % 2 ? 'true' : undefined} />
        ))}
        <div className="bl-disc" style={{ width: DISC, height: DISC, marginLeft: -DISC / 2, marginTop: -DISC / 2 }}>
          <div className="bl-flare" />
          <BoostBolt size={48} tone="white" />
        </div>
      </div>
      <div className="bl-text">
        <div className="bl-title">{t('boost.launch.title', 'Boost activated')}</div>
        <div className="bl-sub">{t('boost.launch.sub', "Let's go for a ride")}</div>
        <div className="bl-work">
          <span className="bl-work-bar">
            <span className="bl-work-fill" />
          </span>
          <span>{t('boost.launch.working', 'Putting you in front of people nearby')}</span>
        </div>
      </div>
      <div className="bl-burst" />
    </div>,
    document.body
  );
};

export default BoostLaunchAnimation;
