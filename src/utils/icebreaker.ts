// "Break the ice" - pure logic (no React, no network). The server (supabase/migrations/
// 20261128120000_icebreakers_weekly_24h.sql + 20261128150000_icebreakers_as_chats.sql) is the authority for quota and rules; everything here
// only decides what to SHOW. Kept pure so it is unit-tested.

import { vibeLabel } from '@/constants/vibe';

export const ICEBREAKER_MAX_LEN = 280;

export interface IcebreakerQuota {
  isPremium: boolean;
  /** First hellos per 7-day window (10). null only if unknown. */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** When the current 7-day window ends and the allowance renews to a fresh 10 (null = no window running yet). */
  resetsAt?: string | null;
}

export type IcebreakerAction = 'hidden' | 'send' | 'sent' | 'say_hi' | 'renewing';

/**
 * What the Break the ice button should be for one person.
 *  hidden  - backend not available (migration not applied) or it is your own profile
 *  say_hi  - you're already matched: open the chat instead
 *  sent    - you already have an open icebreaker to them
 *  renewing - this week's 10 are used up: the button stays, tapping it says when the week renews
 *  send    - normal state (also while the status is still loading, so the button never flickers)
 */
export function icebreakerAction(input: {
  available: boolean | null;
  isOwnProfile?: boolean;
  matched: boolean;
  pending: boolean;
  quota: IcebreakerQuota | null;
}): IcebreakerAction {
  if (input.available === false || input.isOwnProfile) return 'hidden';
  if (input.matched) return 'say_hi';
  if (input.pending) return 'sent';
  const q = input.quota;
  if (q && q.remaining !== null && q.remaining <= 0) return 'renewing';
  return 'send';
}

/**
 * The chances indicator is a heart and a NUMBER (no sentence on screen). Screen readers still get words.
 *  left - count > 0 (of 10 this week)
 *  none - used up until the week renews
 */
export type ChancesDisplay = { kind: 'unknown' } | { kind: 'left'; count: number; limit: number | null } | { kind: 'none'; premium: boolean };

export function chancesDisplay(q: IcebreakerQuota | null): ChancesDisplay {
  if (!q || q.remaining === null) return { kind: 'unknown' };
  const remaining = Math.max(0, q.remaining);
  if (remaining <= 0) return { kind: 'none', premium: q.isPremium };
  return { kind: 'left', count: remaining, limit: q.limit };
}

/** Same rules as the server: no control chars / angle brackets, trimmed, at most 280 chars. */
export function sanitizeIcebreaker(input: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = (input || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '');
  return cleaned.trim().slice(0, ICEBREAKER_MAX_LEN);
}

/** What the composer can do with the current text. */
export function icebreakerDraftState(text: string): { length: number; canSend: boolean; nearLimit: boolean } {
  const length = Array.from(text || '').length;
  const clean = sanitizeIcebreaker(text);
  return { length, canSend: clean.length > 0, nearLimit: length >= ICEBREAKER_MAX_LEN - 20 };
}

export type Starter = { basis: 'interest' | 'value' | 'music' | 'city' | 'generic' | 'free'; value?: string };

/** Free-style openers (not tied to anything on the profile): short, warm, easy to answer. */
export const FREE_OPENERS: Record<string, string> = {
  evening: 'What would a perfect evening look like for you?',
  song: 'What song do you have on repeat right now?',
  laugh: "What's the last thing that made you laugh out loud?",
  coffee: 'Coffee, tea, or something sweeter?',
  sunday: 'Ideal Sunday: an early walk or a slow lie-in?',
  secret: "What's something most people don't know about you?",
  escape: 'Beach, mountains or a big city - where would you escape to?',
  smile: "What's been making you smile lately?",
  dance: 'Honest question: great dancer or great pretender?',
  love: 'What does a great first date look like to you?',
};
export const FREE_OPENER_IDS = Object.keys(FREE_OPENERS);

/** First hellos per 7-day window. The week renews to a fresh 10 (unused ones are not added on). The server is the
 *  authority; this only fills the number in while the backend isn't reachable. */
export const WEEKLY_CHANCES = 10;
/** How long the other person has to answer. */
export const ICEBREAKER_REPLY_HOURS = 24;
export const defaultQuota = (isPremium: boolean): IcebreakerQuota => ({ isPremium, limit: WEEKLY_CHANCES, used: 0, remaining: WEEKLY_CHANCES, resetsAt: null });
type Tr = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/**
 * The opener text for one conversation starter (used by the Break the ice CARD and the composer, so
 * they can never drift apart).
 */
export function openerText(st: Starter, name: string, tr: Tr): string {
  if (st.basis === 'interest') return tr('cards.starter.interest', 'What got you into {{thing}}?', { thing: (st.value || '').toLowerCase() });
  if (st.basis === 'value') return tr('cards.starter.value', 'What does {{thing}} look like for you?', { thing: vibeLabel('values', st.value || '', tr).toLowerCase() });
  if (st.basis === 'music') return tr('cards.starter.music', 'What song is on repeat for you lately?');
  if (st.basis === 'city') return tr('cards.starter.city', "What's your favourite spot in {{city}}?", { city: st.value });
  if (st.basis === 'free') {
    const id = st.value && FREE_OPENERS[st.value] ? st.value : FREE_OPENER_IDS[0];
    return tr(`icebreaker.free.${id}`, FREE_OPENERS[id], { name });
  }
  return tr('cards.starter.generic', 'Hi {{name}} 👋 how is your week going?', { name });
}

/** `count` free-style lines starting at `offset` (cycles), for the "more ideas" shuffle. */
export function freestyleLines(count: number, offset: number, name: string, tr: Tr): string[] {
  const n = FREE_OPENER_IDS.length;
  return Array.from({ length: Math.min(count, n) }, (_, i) => sanitizeIcebreaker(openerText({ basis: 'free', value: FREE_OPENER_IDS[(offset * count + i) % n] }, name, tr)));
}

/** Up to 3 distinct opener lines, best first; always at least the generic one. */
export function openerLines(starters: Starter[] | undefined, name: string, tr: Tr): string[] {
  const list: Starter[] = starters && starters.length > 0 ? starters : [{ basis: 'generic' }];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const st of list) {
    const line = sanitizeIcebreaker(openerText(st, name, tr));
    if (line && !seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
    if (out.length >= 3) break;
  }
  return out;
}

export type IcebreakerSendError =
  | 'already_sent'
  | 'already_matched'
  | 'quota_exhausted'
  | 'daily_limit'
  | 'rate_limited'
  | 'invalid_message'
  | 'unavailable'
  | 'generic';

/** Map a server error code to the i18n key suffix of the calm one-line message. */
export function sendErrorKey(code: string | undefined): IcebreakerSendError {
  switch (code) {
    case 'already_sent':
    case 'already_matched':
    case 'quota_exhausted':
    case 'daily_limit':
    case 'rate_limited':
    case 'invalid_message':
    case 'unavailable':
      return code;
    case 'invalid_recipient':
    case 'not_authenticated':
      return 'unavailable';
    default:
      return 'generic';
  }
}

/** Milliseconds left until an ISO time (never negative; 0 when unknown or passed). */
export function msUntil(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, t - now) : 0;
}

/** The running timer: 23:59:07 (always hours:minutes:seconds, so it never changes width while it counts). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/** Long-range countdown for "chances renew in ...": "6d 4h", "5h 20m", "12m". */
export function formatRenews(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
