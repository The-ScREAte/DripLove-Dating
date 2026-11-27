/**
 * Pure helpers for the chat UI (list rows, message grouping, link/emoji
 * detection). No React, no network - everything here is unit tested.
 */

/** Messages from the same sender closer together than this read as one group. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

interface TimedMessage {
  sender_id: string;
  created_at?: string;
  sent_at?: string;
}

const messageTime = (m: TimedMessage | undefined): number =>
  m ? new Date(m.created_at || m.sent_at || '').getTime() : NaN;

export interface GroupFlags {
  /** Continues the previous bubble's run (tight spacing above). */
  isConsecutive: boolean;
  /** Last bubble of its run (gets the tail + the avatar + the timestamp). */
  isLastInGroup: boolean;
  /** First bubble of its run (gets the full corner radius above). */
  isFirstInGroup: boolean;
}

/** Run-grouping flags for messages[index]: same sender, < GROUP_GAP_MS apart. */
export function getGroupFlags<T extends TimedMessage>(messages: T[], index: number): GroupFlags {
  const prev = messages[index - 1];
  const cur = messages[index];
  const next = messages[index + 1];
  const isConsecutive =
    !!prev && prev.sender_id === cur.sender_id && messageTime(cur) - messageTime(prev) < GROUP_GAP_MS;
  const isLastInGroup =
    !next || next.sender_id !== cur.sender_id || messageTime(next) - messageTime(cur) >= GROUP_GAP_MS;
  return { isConsecutive, isLastInGroup, isFirstInGroup: !isConsecutive };
}

/** True when `cur` starts a new calendar day compared with `prev` (or has no prev). */
export function startsNewDay<T extends TimedMessage>(prev: T | undefined, cur: T): boolean {
  if (!prev) return true;
  return new Date(messageTime(cur)).toDateString() !== new Date(messageTime(prev)).toDateString();
}

// 1-3 emoji (with variation selectors / ZWJ sequences / skin tones) and
// nothing else -> rendered larger, like every mainstream chat app.
// Built with new RegExp (not a literal) so an engine without Unicode property
// escapes can't fail to PARSE the whole bundle - it just never shows big emoji.
let EMOJI_ONLY: RegExp | null = null;
try {
  EMOJI_ONLY = new RegExp(
    '^(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|\\p{Emoji_Modifier})*\\s*){1,3}$',
    'u'
  );
} catch {
  EMOJI_ONLY = null;
}

export function isEmojiOnly(text: string | null | undefined): boolean {
  const t = (text || '').trim();
  return !!EMOJI_ONLY && t.length > 0 && t.length <= 24 && EMOJI_ONLY.test(t);
}

export interface TextPart {
  type: 'text' | 'link';
  value: string;
  /** Only set for links; always an http(s) URL. */
  href?: string;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

/**
 * Splits plain text into text and http(s) link parts. Anything that is not a
 * well-formed http/https URL stays text - so a message can never smuggle a
 * javascript:/data: link into an anchor.
 */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];
    const trailing = raw.match(TRAILING_PUNCT)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, raw.length - trailing.length);
    let href: string | null = null;
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') href = url.href;
    } catch {
      href = null;
    }
    if (!href) continue;
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) });
    parts.push({ type: 'link', value: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}

/** One-line preview text: collapses newlines/runs of whitespace. */
export function previewText(message: string | null | undefined): string {
  return (message || '').replace(/\s+/g, ' ').trim();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chat-list timestamp: time today, "Yesterday" label, weekday within the
 * last week, otherwise a short date. `locale` is the i18n language.
 */
export function formatListTime(
  iso: string | null | undefined,
  now: Date,
  locale: string | undefined,
  yesterdayLabel: string
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfThat) / DAY_MS);
  try {
    if (dayDiff <= 0) return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
    if (dayDiff === 1) return yesterdayLabel;
    if (dayDiff < 7) return date.toLocaleDateString(locale, { weekday: 'short' });
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  } catch {
    return date.toLocaleDateString();
  }
}
