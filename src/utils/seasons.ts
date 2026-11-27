/**
 * Which seasonal greeting (if any) the opening splash should show today. Pure + date-driven, so it changes by itself
 * every year: nothing to edit or release when a holiday comes round. Windows are inclusive, local time.
 */
export type SeasonId = 'newyear' | 'valentine' | 'easter' | 'halloween' | 'thanksgiving' | 'christmas' | 'default';

export interface Season {
  id: SeasonId;
  /** i18n key + English fallback for the big greeting. */
  key: string;
  text: string;
  /** Second line (smaller). */
  subKey: string;
  sub: string;
  /** Falling/rising particles: emoji glyphs, or null for coloured confetti. */
  glyphs: string[] | null;
  /** 'down' falls from the top, 'up' floats up from the bottom. */
  flow: 'down' | 'up';
  /** Accent colours (confetti / glow). */
  colors: string[];
}

const SEASONS: Record<SeasonId, Season> = {
  newyear: { id: 'newyear', key: 'season.newyear', text: 'Happy New Year!', subKey: 'season.newyearSub', sub: 'Here’s to new beginnings and real love.', glyphs: null, flow: 'down', colors: ['#ffd166', '#ff5fa2', '#7c5cff', '#4de1c1', '#ffffff'] },
  valentine: { id: 'valentine', key: 'season.valentine', text: 'Happy Valentine’s Day', subKey: 'season.valentineSub', sub: 'Love is in the air.', glyphs: ['♥', '\u{1F495}', '\u{1F496}'], flow: 'up', colors: ['#ff5fa2'] },
  easter: { id: 'easter', key: 'season.easter', text: 'Happy Easter', subKey: 'season.easterSub', sub: 'Wishing you a lovely weekend.', glyphs: ['\u{1F338}', '\u{1F423}', '\u{1F337}'], flow: 'down', colors: ['#ffd166'] },
  halloween: { id: 'halloween', key: 'season.halloween', text: 'Happy Halloween', subKey: 'season.halloweenSub', sub: 'Find someone to haunt your heart.', glyphs: ['\u{1F383}', '\u{1F987}', '\u{1F47B}'], flow: 'down', colors: ['#ff9f43'] },
  thanksgiving: { id: 'thanksgiving', key: 'season.thanksgiving', text: 'Happy Thanksgiving', subKey: 'season.thanksgivingSub', sub: 'Grateful for you.', glyphs: ['\u{1F342}', '\u{1F341}', '\u{1F342}'], flow: 'down', colors: ['#ffb347'] },
  christmas: { id: 'christmas', key: 'season.christmas', text: 'Merry Christmas', subKey: 'season.christmasSub', sub: 'Warm wishes from DripLove.', glyphs: ['❄', '❅', '❆'], flow: 'down', colors: ['#ffffff'] },
  default: { id: 'default', key: 'season.default', text: 'Slide In & Fall Into Real Love', subKey: 'season.defaultSub', sub: 'Welcome to DripLove.', glyphs: ['♥'], flow: 'up', colors: ['#ff5fa2'] },
};

/** Western (Gregorian) Easter Sunday for a year - Meeus/Jones/Butcher. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** US Thanksgiving: 4th Thursday of November. */
export function thanksgivingDay(year: number): number {
  const firstDow = new Date(year, 10, 1).getDay(); // 0 Sun .. 4 Thu
  const firstThu = 1 + ((4 - firstDow + 7) % 7);
  return firstThu + 21;
}

const dayOfYear = (y: number, m0: number, d: number) => Math.round((new Date(y, m0, d).getTime() - new Date(y, 0, 1).getTime()) / 86_400_000);

export function seasonFor(date: Date = new Date()): Season {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based
  const d = date.getDate();

  if ((m === 11 && d >= 30) || (m === 0 && d <= 3)) return SEASONS.newyear;
  if (m === 11 && d >= 18 && d <= 26) return SEASONS.christmas;
  if (m === 1 && d >= 12 && d <= 14) return SEASONS.valentine;

  const e = easterSunday(y);
  const diff = dayOfYear(y, m, d) - dayOfYear(y, e.month - 1, e.day);
  if (diff >= -2 && diff <= 1) return SEASONS.easter; // Good Friday .. Easter Monday

  if (m === 9 && d >= 29) return SEASONS.halloween;

  const t = thanksgivingDay(y);
  if (m === 10 && d >= t - 2 && d <= t + 1) return SEASONS.thanksgiving;

  return SEASONS.default;
}

/** For previews/QA: `?season=newyear` in the URL or localStorage `dl_season` (ignored unless it is a known id). */
export function seasonOverride(): Season | null {
  try {
    const q = new URLSearchParams(window.location.search).get('season') || localStorage.getItem('dl_season');
    if (q && q in SEASONS) return SEASONS[q as SeasonId];
  } catch {
    /* storage/URL unavailable */
  }
  return null;
}
