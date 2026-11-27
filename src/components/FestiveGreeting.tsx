/**
 * A small, light festive greeting shown as a popup over the app (never a screen of its own): the festival's greeting,
 * a warm line about the people, and one button. A handful of drifting glyphs/confetti (transform + opacity only).
 * Scheduling lives in popups/registry.tsx + popups/festive.ts - once per person per festival, only on the festival.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { seasonFor, seasonMessage, seasonOverride } from '../utils/seasons';
import './festiveGreeting.css';

const PARTICLES = 10;
const frac = (n: number) => n - Math.floor(n);

interface Props {
  onClose: () => void;
}

const FestiveGreeting: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation();
  const season = useMemo(() => seasonOverride() ?? seasonFor(), []);
  const message = useMemo(() => seasonMessage(season), [season]);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => ({
        // outer bands only (left 3-16% / right 84-97%), so nothing ever drifts across the words
        x: (i % 2 === 0 ? 3 : 84) + Math.round(frac(Math.sin(i * 12.9898) * 43758.5453) * 13),
        size: 8 + Math.round(frac(Math.sin(i * 78.233) * 12345.6789) * 10),
        dur: 5 + frac(Math.sin(i * 3.1) * 999) * 3,
        delay: -frac(Math.sin(i * 5.7) * 777) * 5,
        drift: Math.round((frac(Math.sin(i * 9.3) * 555) - 0.5) * 50),
        color: season.colors[i % season.colors.length],
        glyph: season.glyphs ? season.glyphs[i % season.glyphs.length] : null,
      })),
    [season],
  );

  return (
    <div className="dl-festive" role="dialog" aria-modal="true" aria-label={t(season.key, season.text)} data-season={season.id} onClick={onClose}>
      <div className="dl-festive__card" onClick={(e) => e.stopPropagation()}>
        <div className={`dl-festive__particles dl-festive__particles--${season.flow}`} aria-hidden="true">
          {particles.map((p, i) => (
            <span
              key={i}
              className={p.glyph ? 'dl-festive__glyph' : 'dl-festive__confetti'}
              style={
                {
                  left: `${p.x}%`,
                  fontSize: p.glyph ? p.size + 6 : undefined,
                  width: p.glyph ? undefined : p.size * 0.55,
                  height: p.glyph ? undefined : p.size,
                  background: p.glyph ? undefined : p.color,
                  '--dur': `${p.dur}s`,
                  '--delay': `${p.delay}s`,
                  '--drift': `${p.drift}px`,
                } as React.CSSProperties
              }
            >
              {p.glyph}
            </span>
          ))}
        </div>
        <button type="button" className="dl-festive__x" aria-label={t('common.close', 'Close')} onClick={onClose}>
          <X size={18} />
        </button>
        <div className="dl-festive__badge">
          <img className="dl-festive__logo" src="/driplove-logo.webp" alt="" width={64} height={64} />
        </div>
        <h2 className="dl-festive__title font-brush">{t(season.key, season.text)}</h2>
        <p className="dl-festive__msg">{t(message.key, message.text)}</p>
        <div className="dl-festive__rule" aria-hidden="true" />
        <p className="dl-festive__foot">
          <span aria-hidden="true">{'\u2665'}</span> {t('season.footer', "We're here with you.")}
        </p>
        <button type="button" className="dl-festive__btn" onClick={onClose}>
          {t('season.thanks', 'Thank you')}
        </button>
      </div>
    </div>
  );
};

export default FestiveGreeting;
