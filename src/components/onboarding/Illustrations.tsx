import React from 'react';
import { Briefcase, Camera, Check, Coffee, Gem, Heart, HeartHandshake, Mail, MapPin, Music2, PenLine, Ruler, Sparkles, Star, User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/* ------------------------------------------------------------------ *
 * App-made illustrations for the onboarding demos. Inline SVG only, so
 * nothing extra downloads on slow connections, and they scale from 320px
 * up. Motion is CSS (opacity/transform) and switches off under reduced
 * motion - see onboarding.css.
 * ------------------------------------------------------------------ */

const SKIN = '#f2c29b';
const HAIR = '#3b2a24';

interface FaceProps {
  cx: number;
  cy: number;
  r: number;
  smile?: boolean;
  glasses?: boolean;
  dark?: boolean;
}

const Face = ({ cx, cy, r, smile = true, glasses = false, dark = false }: FaceProps) => (
  <g opacity={dark ? 0.55 : 1}>
    <circle cx={cx} cy={cy - r * 0.15} r={r * 1.08} fill={HAIR} />
    <circle cx={cx} cy={cy} r={r} fill={SKIN} />
    {glasses ? (
      <>
        <rect x={cx - r * 0.78} y={cy - r * 0.3} width={r * 0.68} height={r * 0.4} rx={r * 0.12} fill="#111" />
        <rect x={cx + r * 0.1} y={cy - r * 0.3} width={r * 0.68} height={r * 0.4} rx={r * 0.12} fill="#111" />
        <rect x={cx - r * 0.12} y={cy - r * 0.2} width={r * 0.24} height={r * 0.07} fill="#111" />
      </>
    ) : (
      <>
        <circle cx={cx - r * 0.36} cy={cy - r * 0.12} r={r * 0.09} fill="#2a1d18" />
        <circle cx={cx + r * 0.36} cy={cy - r * 0.12} r={r * 0.09} fill="#2a1d18" />
      </>
    )}
    {smile ? (
      <path
        d={`M ${cx - r * 0.38} ${cy + r * 0.28} Q ${cx} ${cy + r * 0.68} ${cx + r * 0.38} ${cy + r * 0.28}`}
        stroke="#9a3b3b"
        strokeWidth={r * 0.1}
        fill="none"
        strokeLinecap="round"
      />
    ) : (
      <line x1={cx - r * 0.25} y1={cy + r * 0.42} x2={cx + r * 0.25} y2={cy + r * 0.42} stroke="#9a3b3b" strokeWidth={r * 0.1} strokeLinecap="round" />
    )}
  </g>
);

const Body = ({ cx, y, w, color }: { cx: number; y: number; w: number; color: string }) => (
  <path d={`M ${cx - w} ${y + 34} Q ${cx - w} ${y} ${cx} ${y} Q ${cx + w} ${y} ${cx + w} ${y + 34} Z`} fill={color} />
);

type TileKind = 'smile' | 'light' | 'life' | 'sunglasses' | 'dark' | 'group' | 'mirror';

const Art = ({ kind }: { kind: TileKind }) => {
  switch (kind) {
    case 'smile':
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <rect width="80" height="80" fill="#2b2140" />
          <Body cx={40} y={56} w={22} color="#ec4899" />
          <Face cx={40} cy={40} r={15} />
          <g stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="66" cy="14" r="5" fill="#fbbf24" stroke="none" />
            <line x1="66" y1="4" x2="66" y2="6" />
            <line x1="76" y1="14" x2="74" y2="14" />
            <line x1="59" y1="7" x2="60.6" y2="8.6" />
          </g>
        </svg>
      );
    case 'light':
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <defs>
            <linearGradient id="ob-win" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.95" />
              <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="80" height="80" fill="#2b2140" />
          <rect x="0" y="0" width="80" height="80" fill="url(#ob-win)" />
          <Body cx={44} y={58} w={22} color="#a78bfa" />
          <Face cx={44} cy={42} r={14} />
        </svg>
      );
    case 'life':
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <rect width="80" height="80" fill="#1f3a4d" />
          <path d="M0 62 L22 34 L38 52 L54 28 L80 60 L80 80 L0 80 Z" fill="#2f6f5e" />
          <circle cx="14" cy="16" r="6" fill="#fbbf24" />
          <circle cx="44" cy="30" r="5" fill={SKIN} />
          <path d="M44 35 L44 50 M44 40 L36 46 M44 40 L52 44 M44 50 L39 62 M44 50 L50 62" stroke="#ec4899" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'sunglasses':
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <rect width="80" height="80" fill="#2b2140" />
          <Body cx={40} y={56} w={22} color="#64748b" />
          <Face cx={40} cy={40} r={15} glasses />
        </svg>
      );
    case 'dark':
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <rect width="80" height="80" fill="#0a0a10" />
          <Body cx={40} y={56} w={22} color="#334155" />
          <Face cx={40} cy={40} r={15} dark smile={false} />
        </svg>
      );
    case 'group':
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <rect width="80" height="80" fill="#2b2140" />
          <Body cx={18} y={62} w={14} color="#ec4899" />
          <Body cx={62} y={62} w={14} color="#22d3ee" />
          <Body cx={40} y={58} w={14} color="#a78bfa" />
          <Face cx={18} cy={48} r={9} />
          <Face cx={62} cy={48} r={9} />
          <Face cx={40} cy={44} r={10} />
        </svg>
      );
    case 'mirror':
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <rect width="80" height="80" fill="#cbd5e1" />
          <rect x="6" y="6" width="68" height="68" rx="6" fill="#94a3b8" />
          <Body cx={40} y={58} w={20} color="#ec4899" />
          <Face cx={40} cy={44} r={12} />
          <rect x="31" y="30" width="18" height="30" rx="4" fill="#0f172a" />
          <rect x="33" y="33" width="14" height="22" rx="2" fill="#475569" />
        </svg>
      );
  }
};

const DOS: TileKind[] = ['smile', 'light', 'life'];
const AVOIDS: TileKind[] = ['sunglasses', 'dark', 'group', 'mirror'];

const Tile = ({ kind, good }: { kind: TileKind; good: boolean }) => {
  const { t } = useTranslation();
  const label = t(`onboarding.tips.${kind === 'sunglasses' ? 'sunglasses' : kind}`);
  return (
    <figure className="ob-example" data-good={good}>
      <div className="ob-example-art">
        <Art kind={kind} />
        <span className="ob-example-badge" aria-hidden="true">
          {good ? <Check className="h-3 w-3" strokeWidth={3.5} /> : <X className="h-3 w-3" strokeWidth={3.5} />}
        </span>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
};

/** Good-photo / avoid-photo demonstration (app-made illustrations). */
export const PhotoExamples = () => {
  const { t } = useTranslation();
  return (
    <div className="ob-examples">
      <p className="ob-label">{t('onboarding.tips.doHeading')}</p>
      <div className="ob-examples-row" data-cols="3">
        {DOS.map((k) => (
          <Tile key={k} kind={k} good />
        ))}
      </div>
      <p className="ob-label mt-4">{t('onboarding.tips.avoidHeading')}</p>
      <div className="ob-examples-row" data-cols="4">
        {AVOIDS.map((k) => (
          <Tile key={k} kind={k} good={false} />
        ))}
      </div>
    </div>
  );
};

/** Animated face-in-the-oval demo for the verification step. */
export const FaceDemo = () => (
  <div className="ob-facedemo" aria-hidden="true">
    <svg viewBox="0 0 160 200" width="150" height="188">
      <defs>
        <clipPath id="ob-oval-clip">
          <ellipse cx="80" cy="100" rx="52" ry="68" />
        </clipPath>
        <linearGradient id="ob-scan-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="hsl(var(--dl-brand, 330 81% 60%))" stopOpacity="0" />
          <stop offset="0.5" stopColor="hsl(var(--dl-brand, 330 81% 60%))" stopOpacity="0.95" />
          <stop offset="1" stopColor="hsl(var(--dl-brand, 330 81% 60%))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="100" rx="52" ry="68" fill="rgba(255,255,255,0.04)" />
      <g clipPath="url(#ob-oval-clip)">
        <Body cx={80} y={150} w={44} color="#ec4899" />
        <Face cx={80} cy={96} r={30} />
        <rect className="ob-scan-line" x="20" y="34" width="120" height="3" rx="1.5" fill="url(#ob-scan-grad)" />
      </g>
      <ellipse className="ob-oval-ring" cx="80" cy="100" rx="52" ry="68" fill="none" stroke="hsl(var(--dl-brand, 330 81% 60%))" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
      {[[16, 20, 1, 1], [144, 20, -1, 1], [16, 180, 1, -1], [144, 180, -1, -1]].map(([x, y, sx, sy], i) => (
        <path key={i} d={`M ${x} ${y + sy * 14} L ${x} ${y} L ${x + sx * 14} ${y}`} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinecap="round" />
      ))}
    </svg>
  </div>
);

type BurstSize = 'sm' | 'md' | 'lg';

const BURSTS: Record<BurstSize, { x: number; d: number; s: number }[]> = {
  // phase end: a few small hearts pop out of the riding heart
  sm: [
    { x: -22, d: 0, s: 8 },
    { x: -8, d: 60, s: 10 },
    { x: 10, d: 30, s: 8 },
    { x: 24, d: 90, s: 10 },
  ],
  md: [
    { x: -92, d: 0, s: 18 },
    { x: -52, d: 120, s: 12 },
    { x: -16, d: 40, s: 22 },
    { x: 24, d: 180, s: 14 },
    { x: 60, d: 80, s: 20 },
    { x: 96, d: 220, s: 12 },
  ],
  // the finish line: a bigger shower
  lg: [
    { x: -130, d: 0, s: 16 },
    { x: -104, d: 140, s: 22 },
    { x: -76, d: 60, s: 12 },
    { x: -48, d: 200, s: 26 },
    { x: -22, d: 100, s: 14 },
    { x: 4, d: 20, s: 30 },
    { x: 30, d: 160, s: 16 },
    { x: 56, d: 80, s: 24 },
    { x: 82, d: 240, s: 12 },
    { x: 108, d: 40, s: 20 },
    { x: 134, d: 180, s: 16 },
    { x: 0, d: 300, s: 18 },
  ],
};

/** Hearts that drift up once - a milestone flourish. Opacity/transform only. */
export const HeartsBurst = ({ size = 'md' }: { size?: BurstSize }) => (
  <div className="ob-burst" data-size={size} aria-hidden="true">
    {BURSTS[size].map((h, i) => (
      <Heart
        key={i}
        className="ob-burst-heart"
        style={{ ['--x' as string]: `${h.x}px`, animationDelay: `${h.d}ms`, width: h.s, height: h.s }}
        fill="url(#ob-heart-grad)"
        stroke="none"
      />
    ))}
  </div>
);

/**
 * A small, gently floating hero for each screen so every step looks like
 * something new (not one repeated form). Brand gradient, three hue accents by
 * phase. Pure CSS motion; stops under reduced motion.
 */
const HERO_ICONS = {
  account: Mail,
  you: User,
  looking: Heart,
  location: MapPin,
  work: Briefcase,
  signs: Star,
  photos: Camera,
  bio: PenLine,
  details: Ruler,
  lifestyle: Coffee,
  interests: Sparkles,
  values: Gem,
  music: Music2,
  love: HeartHandshake,
} as const;

export type HeroKind = keyof typeof HERO_ICONS;

export const StepHero = ({ kind, phase }: { kind: HeroKind; phase: 1 | 2 | 3 | 5 }) => {
  const Icon = HERO_ICONS[kind];
  return (
    <div className="ob-hero" data-phase={phase} aria-hidden="true">
      <span className="ob-hero-ring" />
      <span className="ob-hero-core">
        <Icon />
      </span>
      <Sparkles className="ob-hero-spark ob-hero-spark-a" />
      <Sparkles className="ob-hero-spark ob-hero-spark-b" />
    </div>
  );
};

const DRIFT = [
  { x: 8, d: 0, s: 18, t: 5.2 },
  { x: 22, d: 1.4, s: 26, t: 6.4 },
  { x: 36, d: 0.6, s: 14, t: 5.6 },
  { x: 50, d: 2.2, s: 30, t: 6.8 },
  { x: 64, d: 0.9, s: 16, t: 5.4 },
  { x: 78, d: 1.8, s: 24, t: 6.2 },
  { x: 90, d: 0.3, s: 14, t: 5.8 },
];

/** Soft hearts drifting up behind the "You're in!" moment. Opacity/transform only. */
export const DriftingHearts = () => (
  <div className="ob-drift" aria-hidden="true">
    {DRIFT.map((h, i) => (
      <Heart
        key={i}
        className="ob-drift-heart"
        style={{ left: `${h.x}%`, width: h.s, height: h.s, animationDelay: `${h.d}s`, animationDuration: `${h.t}s` }}
        fill="url(#ob-heart-grad)"
        stroke="none"
      />
    ))}
  </div>
);

/** Shared gradient used to fill hearts (defined once, referenced by id). */
export const HeartDefs = () => (
  <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
    <defs>
      <linearGradient id="ob-heart-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="hsl(var(--dl-brand-from, 330 81% 60%))" />
        <stop offset="1" stopColor="hsl(var(--dl-brand-to, 271 81% 56%))" />
      </linearGradient>
    </defs>
  </svg>
);
