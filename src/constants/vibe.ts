// "Vibe" = what a person values in a relationship + the music they love.
//
// Stored with NO schema change, inside the existing `profiles.favorites` jsonb:
//   - values + music genres live in ONE reserved entry  { category: 'Vibe', values: [...], genres: [...] }
//   - favorite artists + a share link live in a normal Music favorite
//     { category: 'Music', topArtists: [...], link }  (what the Profile screen already edits)
// Values and genres are stored as language-neutral IDs ('honesty', 'afrobeats') so
// matching works across all app languages; labels come from i18n (`vibe.values.*`,
// `vibe.genres.*`) with the English label below as the fallback.

import type { FavoriteEntry } from '@/constants/favorites';
import { isPlayableMusicLink } from '@/utils/musicLink';

/** Reserved favorites entry that carries values + genres (never shown as a normal favorite). */
export const VIBE_CATEGORY = 'Vibe';

export const MAX_VALUES = 5;
export const MAX_GENRES = 5;
export const MAX_ARTISTS = 3;
export const MAX_ARTIST_LENGTH = 60;
/** Suggested minimums (a nudge only - every vibe screen is skippable). */
export const SUGGESTED_MIN_INTERESTS = 5;
export const SUGGESTED_MIN_VALUES = 3;
export const SUGGESTED_MIN_GENRES = 2;

export interface VibeOption {
  id: string;
  label: string;
  emoji: string;
}

export const VALUE_OPTIONS: VibeOption[] = [
  { id: 'honesty', label: 'Honesty', emoji: '🤝' },
  { id: 'loyalty', label: 'Loyalty', emoji: '🛡️' },
  { id: 'humor', label: 'Humor', emoji: '😄' },
  { id: 'kindness', label: 'Kindness', emoji: '💗' },
  { id: 'respect', label: 'Respect', emoji: '🙏' },
  { id: 'communication', label: 'Communication', emoji: '💬' },
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { id: 'faith', label: 'Faith', emoji: '✨' },
  { id: 'ambition', label: 'Ambition', emoji: '🚀' },
  { id: 'growth', label: 'Growth', emoji: '🌱' },
  { id: 'adventure', label: 'Adventure', emoji: '🧭' },
  { id: 'affection', label: 'Affection', emoji: '🤗' },
  { id: 'stability', label: 'Stability', emoji: '🏡' },
  { id: 'independence', label: 'Independence', emoji: '🦋' },
  { id: 'culture', label: 'Culture & roots', emoji: '🌍' },
  { id: 'fun', label: 'Fun', emoji: '🎉' },
  { id: 'generosity', label: 'Generosity', emoji: '🎁' },
  { id: 'intimacy', label: 'Intimacy', emoji: '🔥' },
];

export const GENRE_OPTIONS: VibeOption[] = [
  { id: 'afrobeats', label: 'Afrobeats', emoji: '🥁' },
  { id: 'amapiano', label: 'Amapiano', emoji: '🎹' },
  { id: 'highlife', label: 'Highlife', emoji: '🎺' },
  { id: 'hiphop', label: 'Hip-Hop', emoji: '🎤' },
  { id: 'rnb', label: 'R&B', emoji: '💜' },
  { id: 'gospel', label: 'Gospel', emoji: '🙌' },
  { id: 'reggae', label: 'Reggae & Dancehall', emoji: '🌴' },
  { id: 'pop', label: 'Pop', emoji: '🎧' },
  { id: 'rock', label: 'Rock', emoji: '🎸' },
  { id: 'jazz', label: 'Jazz', emoji: '🎷' },
  { id: 'soul', label: 'Soul', emoji: '🎶' },
  { id: 'house', label: 'House', emoji: '🪩' },
  { id: 'latin', label: 'Latin', emoji: '💃' },
  { id: 'country', label: 'Country', emoji: '🤠' },
  { id: 'classical', label: 'Classical', emoji: '🎻' },
  { id: 'alternative', label: 'Alternative', emoji: '🌀' },
];

const VALUE_IDS = new Set(VALUE_OPTIONS.map((o) => o.id));
const GENRE_IDS = new Set(GENRE_OPTIONS.map((o) => o.id));

const uniq = (list: string[]) => [...new Set(list)];

/** Lower-case, strip accents/punctuation, collapse spaces - for comparing free text (artists). */
export const normalizeText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ一-鿿 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Free-text artist: no markup, bounded length, single spaces. */
export const sanitizeArtist = (raw: string): string =>
  raw
    .replace(/<[^>]*>?/g, '')
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_ARTIST_LENGTH)
    .trim();

export interface Vibe {
  values: string[];
  genres: string[];
  artists: string[];
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];

/** Read values / genres / artists from a (parsed or raw) favorites list. Never throws. */
export function getVibe(favorites: unknown): Vibe {
  const out: Vibe = { values: [], genres: [], artists: [] };
  if (!Array.isArray(favorites)) return out;
  for (const item of favorites) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Partial<FavoriteEntry> & { category?: unknown };
    if (f.category === VIBE_CATEGORY) {
      out.values.push(...strings(f.values).filter((v) => VALUE_IDS.has(v)));
      out.genres.push(...strings(f.genres).filter((v) => GENRE_IDS.has(v)));
    } else if (f.category === 'Music') {
      out.artists.push(...strings(f.topArtists).map((a) => a.trim()));
      if (typeof f.detail === 'string' && f.detail.trim()) out.artists.push(f.detail.trim());
      out.genres.push(...strings(f.genres).filter((v) => GENRE_IDS.has(v)));
    }
  }
  out.values = uniq(out.values).slice(0, MAX_VALUES);
  out.genres = uniq(out.genres).slice(0, MAX_GENRES);
  const seen = new Set<string>();
  out.artists = out.artists.filter((a) => {
    const k = normalizeText(a);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out;
}

/** True for the reserved entry that must never be shown/edited as a normal favorite. */
export const isVibeEntry = (f: { category?: unknown } | null | undefined): boolean => f?.category === VIBE_CATEGORY;

/** Set (or clear) the reserved vibe entry, leaving every other favorite untouched. */
export function withVibe(
  favorites: FavoriteEntry[],
  next: { values?: string[]; genres?: string[] },
): FavoriteEntry[] {
  const current = getVibeEntry(favorites);
  const values = uniq((next.values ?? current.values).filter((v) => VALUE_IDS.has(v))).slice(0, MAX_VALUES);
  const genres = uniq((next.genres ?? current.genres).filter((v) => GENRE_IDS.has(v))).slice(0, MAX_GENRES);
  const rest = favorites.filter((f) => !isVibeEntry(f));
  if (values.length === 0 && genres.length === 0) return rest;
  return [...rest, { category: VIBE_CATEGORY, values, genres }];
}

function getVibeEntry(favorites: FavoriteEntry[]): { values: string[]; genres: string[] } {
  const entry = favorites.find((f) => isVibeEntry(f));
  return {
    values: strings(entry?.values).filter((v) => VALUE_IDS.has(v)),
    genres: strings(entry?.genres).filter((v) => GENRE_IDS.has(v)),
  };
}

/** Set artists / share link on the (single) Music favorite, creating it if needed. Empty => removes the fields. */
export function withMusic(
  favorites: FavoriteEntry[],
  next: { artists?: string[]; link?: string },
): FavoriteEntry[] {
  const artists = uniq((next.artists ?? []).map(sanitizeArtist).filter(Boolean)).slice(0, MAX_ARTISTS);
  const rawLink = (next.link ?? '').trim();
  const link = rawLink && isPlayableMusicLink(rawLink) ? rawLink : undefined;
  const idx = favorites.findIndex((f) => f.category === 'Music');
  if (idx === -1) {
    if (artists.length === 0 && !link) return favorites;
    return [...favorites, { category: 'Music', topArtists: artists.length ? artists : undefined, link }];
  }
  const copy = [...favorites];
  const prev = copy[idx];
  copy[idx] = {
    ...prev,
    topArtists: artists.length ? artists : prev.topArtists,
    link: link ?? prev.link,
  };
  return copy;
}

/** Label for an id with the English fallback (callers pass i18n `t`). */
export function vibeLabel(kind: 'values' | 'genres', id: string, t?: (key: string, fallback: string) => string): string {
  const list = kind === 'values' ? VALUE_OPTIONS : GENRE_OPTIONS;
  const fallback = list.find((o) => o.id === id)?.label ?? id;
  return t ? t(`vibe.${kind}.${id}`, fallback) : fallback;
}

export interface SharedVibe {
  interests: string[];
  values: string[];
  genres: string[];
  artists: string[];
}

const normList = (list: string[]) => list.map((s) => ({ raw: s, key: normalizeText(s) })).filter((x) => x.key);

/** What two people have in common (display values come from the candidate's side). */
export function sharedVibe(
  viewer: { interests?: unknown; favorites?: unknown } | null | undefined,
  other: { interests?: unknown; favorites?: unknown } | null | undefined,
): SharedVibe {
  const empty: SharedVibe = { interests: [], values: [], genres: [], artists: [] };
  if (!viewer || !other) return empty;
  const mine = getVibe(viewer.favorites);
  const theirs = getVibe(other.favorites);
  const myInterests = new Set(normList(strings(viewer.interests)).map((x) => x.key));
  const myArtists = new Set(normList(mine.artists).map((x) => x.key));
  return {
    interests: normList(strings(other.interests)).filter((x) => myInterests.has(x.key)).map((x) => x.raw),
    values: theirs.values.filter((v) => mine.values.includes(v)),
    genres: theirs.genres.filter((v) => mine.genres.includes(v)),
    artists: normList(theirs.artists).filter((x) => myArtists.has(x.key)).map((x) => x.raw),
  };
}

export const hasShared = (s: SharedVibe): boolean =>
  s.interests.length + s.values.length + s.genres.length + s.artists.length > 0;
