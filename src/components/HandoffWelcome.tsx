import React from 'react';
import { useTranslation } from 'react-i18next';
import HoppingLogo from '@/components/HoppingLogo';
import { FORM_PAGE_BG } from '@/components/forms/formTheme';

interface HandoffWelcomeProps {
  /** First name for "Welcome, {name}"; omit for the plain greeting. */
  firstName?: string | null;
  /** True when this replaces an identical HandoffWelcome that was already on screen: skip the
   *  entrance animations so the text/glow don't blink out and back in. */
  continued?: boolean;
}

// Cheap hearts: fixed offsets/delays, opacity+transform only (see motion.css .dl-heart).
const HEARTS: Array<{ dx: number; d: number; left: number }> = [
  { dx: -46, d: 0.0, left: -34 },
  { dx: 34, d: 0.35, left: 28 },
  { dx: -18, d: 0.7, left: -8 },
  { dx: 52, d: 1.0, left: 46 },
  { dx: -60, d: 1.25, left: -52 },
  { dx: 14, d: 1.5, left: 10 },
];

/**
 * The one "you're in" screen between the terms/profile steps and Discover.
 * Same solid background as the forms and the terms screen, so nothing flashes a
 * different colour; the logo is in the same place for every hand-off variant
 * (terms accept, complete-profile finalising, the app-mount wait), so the
 * logo never re-appears or jumps when one hands over to the next.
 */
const HandoffWelcome: React.FC<HandoffWelcomeProps> = ({ firstName, continued = false }) => {
  const { t } = useTranslation();
  const title = firstName ? t('handoff.welcomeName', { name: firstName }) : t('handoff.welcome');
  return (
    <div
      className={`fixed inset-0 z-[10001] flex flex-col items-center justify-center px-8 text-center${continued ? ' dl-handoff-continued' : ''}`}
      style={{ background: FORM_PAGE_BG }}
      role="status"
      aria-live="polite"
    >
      <div className="dl-handoff-glow" aria-hidden="true" />
      <div className="relative">
        {HEARTS.map((h, i) => (
          <span
            key={i}
            className="dl-heart"
            aria-hidden="true"
            style={{ ['--dx' as string]: `${h.dx}px`, ['--d' as string]: `${h.d}s`, marginLeft: h.left }}
          >
            💗
          </span>
        ))}
        <HoppingLogo size={72} />
      </div>
      <div className="dl-rise mt-6" style={{ animationDelay: '120ms' }}>
        <p className="text-xl font-bold tracking-tight text-white">{title}</p>
        <p className="mt-1.5 text-sm text-white/60">{t('handoff.line')}</p>
      </div>
    </div>
  );
};

export default HandoffWelcome;
