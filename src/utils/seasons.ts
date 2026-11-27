/**
 * Which festive greeting (if any) applies today. Pure + date-driven, so it changes by itself every year: nothing to edit
 * or release when a holiday comes round. Windows are inclusive, local time. 'default' = an ordinary day (no greeting).
 */
export type SeasonId = 'newyear' | 'valentine' | 'easter' | 'halloween' | 'thanksgiving' | 'christmas' | 'default';

export interface Season {
  id: SeasonId;
  /** i18n key + English fallback for the big greeting. */
  key: string;
  text: string;
  /** Second line: a warm message about the people using the app. One is chosen per day (stable within a day). */
  subs: string[];
  /** Falling/rising particles: emoji glyphs, or null for coloured confetti. */
  glyphs: string[] | null;
  /** 'down' falls from the top, 'up' floats up from the bottom. */
  flow: 'down' | 'up';
  /** Accent colours (confetti / glow). */
  colors: string[];
}

const SEASONS: Record<SeasonId, Season> = {
  newyear: { id: 'newyear', key: 'season.newyear', text: 'Happy New Year!', subs: ['Grateful for every person who made this year warmer.', 'Thank you for your effort, your honesty and your hope.', 'May this year bring someone who truly gets you.'], glyphs: null, flow: 'down', colors: ['#ffd166', '#ff5fa2', '#7c5cff', '#4de1c1', '#ffffff'] },
  valentine: { id: 'valentine', key: 'season.valentine', text: 'Happy Valentine’s Day', subs: ['Love takes courage. We see your effort.', 'Here for every hello, every first date, every hope.', 'Whoever you’re hoping for, we’re rooting for you.'], glyphs: ['♥', '\u{1F495}', '\u{1F496}'], flow: 'up', colors: ['#ff5fa2'] },
  easter: { id: 'easter', key: 'season.easter', text: 'Happy Easter', subs: ['Wishing you rest, joy and good company.', 'Grateful for the care you bring to every conversation.', 'New beginnings, and people who are glad you’re here.'], glyphs: ['\u{1F338}', '\u{1F423}', '\u{1F337}'], flow: 'down', colors: ['#ffd166'] },
  halloween: { id: 'halloween', key: 'season.halloween', text: 'Happy Halloween', subs: ['No tricks here, just real people rooting for you.', 'Thanks for being yourself, costume or not.', 'Spooky season is better with good company.'], glyphs: ['\u{1F383}', '\u{1F987}', '\u{1F47B}'], flow: 'down', colors: ['#ff9f43'] },
  thanksgiving: { id: 'thanksgiving', key: 'season.thanksgiving', text: 'Happy Thanksgiving', subs: ['Grateful for your effort and your kindness.', 'Thank you for showing up as yourself.', 'This community is better with you in it.'], glyphs: ['\u{1F342}', '\u{1F341}', '\u{1F342}'], flow: 'down', colors: ['#ffb347'] },
  christmas: { id: 'christmas', key: 'season.christmas', text: 'Merry Christmas', subs: ['Thankful for you and the heart you bring here.', 'Wishing you warmth, joy and people who care.', 'You make this community what it is.'], glyphs: ['❄', '❅', '❆'], flow: 'down', colors: ['#ffffff'] },
  default: { id: 'default', key: 'season.default', text: 'Slide In & Fall Into Real Love', subs: ['We’re glad you’re here.', 'Real connections start with people like you.', 'Every hello matters, and we’re with you.'], glyphs: ['♥'], flow: 'up', colors: ['#ff5fa2'] },
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

/**
 * One id per festival *occurrence* (e.g. 'christmas-2026'), or null on an ordinary day. Used to show each greeting once
 * per person per festival. New Year spans Dec 30 - Jan 3 and belongs to the year it welcomes.
 */
export function festiveKey(date: Date = new Date()): string | null {
  const season = seasonFor(date);
  if (season.id === 'default') return null;
  const y = date.getFullYear() + (season.id === 'newyear' && date.getMonth() === 11 ? 1 : 0);
  return `${season.id}-${y}`;
}

/** The message for today: rotates daily through the season's lines, so it feels fresh without changing mid-day. */
export function seasonMessage(season: Season, date: Date = new Date()): { key: string; text: string } {
  const day = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);
  const i = ((day % season.subs.length) + season.subs.length) % season.subs.length;
  return { key: `season.${season.id}Sub${i + 1}`, text: season.subs[i] };
}

/**
 * For previews/QA only: `?season=newyear` shows that festival's greeting. Never active in a normal production build - it
 * needs a dev build or a build made with VITE_SEASON_PREVIEW=1, so a shared link or a stale storage key can't trigger it.
 */
export function seasonOverride(): Season | null {
  if (!(import.meta.env.DEV || import.meta.env.VITE_SEASON_PREVIEW === '1')) return null;
  try {
    const q = new URLSearchParams(window.location.search).get('season');
    if (q && Object.prototype.hasOwnProperty.call(SEASONS, q) && q !== 'default') return SEASONS[q as SeasonId];
  } catch {
    /* URL unavailable */
  }
  return null;
}
