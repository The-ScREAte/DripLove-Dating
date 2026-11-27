/**
 * The opening screen: logo + a greeting that follows the calendar (New Year confetti, Christmas snow, Valentine
 * hearts, ...), shown for ~2 s when the app opens - for signed-in users and first-timers alike. All motion is
 * transform/opacity on a small fixed number of elements (16), and stops for users who prefer reduced motion.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import HoppingLogo from './HoppingLogo';
import { seasonFor, seasonMessage, seasonOverride } from '../utils/seasons';
import './seasonalSplash.css';

const PARTICLES = 16; // few and soft: light on the phone, calm to look at

// Deterministic spread (no Math.random: the layout must not change between renders).
const frac = (n: number) => n - Math.floor(n);

interface Props {
  /** True while the splash fades out over the app that has just mounted underneath. */
  leaving?: boolean;
  /** Tap to continue (offered once the greeting has had a moment on screen). */
  onSkip?: () => void;
  /** How long the splash is held, for the progress line. */
  durationMs?: number;
  /** 'quick' = just the logo badge on the brand background (ordinary opens): no greeting, particles or progress. */
  variant?: 'full' | 'quick';
}

const SeasonalSplash: React.FC<Props> = ({ leaving = false, onSkip, durationMs = 5000, variant = 'full' }) => {
  const { t } = useTranslation();
  const season = useMemo(() => seasonOverride() ?? seasonFor(), []);
  const message = useMemo(() => seasonMessage(season), [season]);
  const [canSkip, setCanSkip] = React.useState(false);
  React.useEffect(() => {
    const id = window.setTimeout(() => setCanSkip(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const x = Math.round(frac(Math.sin(i * 12.9898) * 43758.5453) * 100);
        const size = 10 + Math.round(frac(Math.sin(i * 78.233) * 12345.6789) * 14);
        const dur = 6 + frac(Math.sin(i * 3.1) * 999) * 3;
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
      className={`dl-splash${leaving ? ' dl-splash--leaving' : ''}${variant === 'quick' ? ' dl-splash--quick' : ''}`}
      data-season={season.id}
      role="status"
      aria-live="polite"
      aria-label={t(season.key, season.text)}
      onClick={canSkip ? onSkip : undefined}
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
        <div className="dl-splash__badge">
          <HoppingLogo size={104} />
        </div>
        <h1 className="dl-splash__title font-brush">{t(season.key, season.text)}</h1>
        <p className="dl-splash__sub">{t(message.key, message.text)}</p>
        <p className="dl-splash__foot">{t('season.footer', "We're here with you.")}</p>
      </div>
      <div className="dl-splash__progress" aria-hidden="true">
        <span style={{ animationDuration: `${durationMs}ms` }} />
      </div>
    </div>
  );
};

export default SeasonalSplash;
