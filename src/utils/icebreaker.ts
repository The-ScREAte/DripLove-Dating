// "Break the ice" - pure logic (no React, no network). The server (supabase/migrations/
// 20261127000000_icebreakers_for_review.sql) is the authority for quota and rules; everything here
// only decides what to SHOW. Kept pure so it is unit-tested.

import { vibeLabel } from '@/constants/vibe';

export const ICEBREAKER_MAX_LEN = 280;

export interface IcebreakerQuota {
  isPremium: boolean;
  /** Free: lifetime total (4). Premium: per rolling day (10). null only if unknown. */
  limit: number | null;
  used: number;
  remaining: number | null;
}

export type IcebreakerAction = 'hidden' | 'send' | 'sent' | 'say_hi' | 'upgrade';

/**
 * What the Break the ice button should be for one person.
 *  hidden  - backend not available (migration not applied) or it is your own profile
 *  say_hi  - you're already matched: open the chat instead
 *  sent    - you already have an open icebreaker to them
 *  upgrade - free quota used up: the button stays, tapping it shows the Premium upsell
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
  if (q && !q.isPremium && q.remaining !== null && q.remaining <= 0) return 'upgrade';
  return 'send';
}

/**
 * The chances indicator is a heart and a NUMBER (no sentence on screen). Screen readers still get words.
 *  left - count > 0 (free: of 4 total; premium: of 10 today)
 *  none - used up (free -> upsell; premium -> "tomorrow")
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

/** Free-style, playful openers (not tied to anything on the profile) - the romantic, light-hearted ones. */
export const FREE_OPENERS: Record<string, string> = {
  evening: 'If we had one perfect evening, what would we do? 🌙',
  song: "What song is stuck in your head right now? 🎶",
  laugh: "What's the last thing that made you laugh out loud?",
  coffee: 'Coffee, tea, or something sweeter? ☕💗',
  sunday: 'Dream Sunday: sunrise walk or sleeping in? ☀️',
  secret: "Tell me one thing most people don't know about you 😉",
  escape: 'Beach, mountains or a big city - where should we escape to? ✈️',
  smile: "You've got a smile that's hard to ignore. What's the story behind it? ✨",
  dance: 'Be honest: are you a great dancer or a great pretender? 💃',
  love: 'What does a perfect first date feel like to you? 💕',
};
export const FREE_OPENER_IDS = Object.keys(FREE_OPENERS);

/** Free quota: first hellos in TOTAL. Premium: per rolling day. (The server is the authority; these only
 *  fill the number in while the backend isn't reachable.) */
export const FREE_TOTAL = 4;
export const PREMIUM_DAILY = 10;
export const defaultQuota = (isPremium: boolean): IcebreakerQuota => {
  const limit = isPremium ? PREMIUM_DAILY : FREE_TOTAL;
  return { isPremium, limit, used: 0, remaining: limit };
};
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

/** Short relative time for the inbox ("now", "5m", "3h", "2d"). */
export function shortAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
