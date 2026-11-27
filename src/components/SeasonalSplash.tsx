/**
 * The opening screen: logo + a greeting that follows the calendar (New Year confetti, Christmas snow, Valentine
 * hearts, ...), shown for ~2 s when the app opens - for signed-in users and first-timers alike. All motion is
 * transform/opacity on a small fixed number of elements (30), and stops for users who prefer reduced motion.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import HoppingLogo from './HoppingLogo';
import { seasonFor, seasonOverride } from '../utils/seasons';
import './seasonalSplash.css';

const PARTICLES = 30;

// Deterministic spread (no Math.random: the layout must not change between renders).
const frac = (n: number) => n - Math.floor(n);

interface Props {
  /** True while the splash fades out over the app that has just mounted underneath. */
  leaving?: boolean;
}

const SeasonalSplash: React.FC<Props> = ({ leaving = false }) => {
  const { t } = useTranslation();
  const season = useMemo(() => seasonOverride() ?? seasonFor(), []);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const x = Math.round(frac(Math.sin(i * 12.9898) * 43758.5453) * 100);
        const size = 10 + Math.round(frac(Math.sin(i * 78.233) * 12345.6789) * 14);
        const dur = 3.6 + frac(Math.sin(i * 3.1) * 999) * 2.4;
        const delay = -frac(Math.sin(i * 5.7) * 777) * 4;
        const drift = Math.round((frac(Math.sin(i * 9.3) * 555) - 0.5) * 70);
        const color = season.colors[i % season.colors.length];
        const glyph = season.glyphs ? season.glyphs[i % season.glyphs.length] : null;
        return { x, size, dur, delay, drift, color, glyph };
      }),
    [season],
  );

  return (
    <div
      className={`dl-splash${leaving ? ' dl-splash--leaving' : ''}`}
      data-season={season.id}
      role="status"
      aria-live="polite"
      aria-label={t(season.key, season.text)}
    >
      <div className={`dl-splash__particles dl-splash__particles--${season.flow}`} aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className={p.glyph ? 'dl-splash__glyph' : 'dl-splash__confetti'}
            style={
              {
                left: `${p.x}%`,
                fontSize: p.glyph ? p.size + 8 : undefined,
                width: p.glyph ? undefined : p.size * 0.55,
                height: p.glyph ? undefined : p.size,
                background: p.glyph ? undefined : p.color,
                color: p.glyph && season.id !== 'christmas' && season.id !== 'valentine' ? undefined : p.color,
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

      <div className="dl-splash__content">
        <HoppingLogo size={76} />
        <h1 className="dl-splash__title font-brush">{t(season.key, season.text)}</h1>
        <p className="dl-splash__sub">{t(season.subKey, season.sub)}</p>
      </div>
    </div>
  );
};

export default SeasonalSplash;
