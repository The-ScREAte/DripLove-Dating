// "Break the ice" - pure logic (no React, no network). The server (supabase/migrations/
// 20261127000000_icebreakers_for_review.sql) is the authority for quota and rules; everything here
// only decides what to SHOW. Kept pure so it is unit-tested.

import { vibeLabel } from '@/constants/vibe';

export const ICEBREAKER_MAX_LEN = 280;

export interface IcebreakerQuota {
  isPremium: boolean;
  /** null = unlimited (premium). */
  limit: number | null;
  used: number;
  /** null = unlimited (premium). */
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
 * What the "chances" pill says. The user sees chances, not quota numbers:
 *  unlimited - Premium                         "Unlimited chances"
 *  none      - free and used up                "No chances left - go Premium"
 *  left      - all free ones still available   "3 chances left" / "1 chance left"
 *  of        - some used                       "2 of 3 free chances left"
 */
export type ChancesDisplay =
  | { kind: 'unknown' }
  | { kind: 'unlimited' }
  | { kind: 'none'; limit: number | null }
  | { kind: 'left'; count: number }
  | { kind: 'of'; count: number; limit: number };

export function chancesDisplay(q: IcebreakerQuota | null): ChancesDisplay {
  if (!q) return { kind: 'unknown' };
  if (q.isPremium || q.remaining === null || q.limit === null) return q.isPremium ? { kind: 'unlimited' } : { kind: 'unknown' };
  const remaining = Math.max(0, q.remaining);
  if (remaining <= 0) return { kind: 'none', limit: q.limit };
  if (remaining === 1 || remaining >= q.limit) return { kind: 'left', count: remaining };
  return { kind: 'of', count: remaining, limit: q.limit };
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

export type Starter = { basis: 'interest' | 'value' | 'music' | 'city' | 'generic'; value?: string };
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
  return tr('cards.starter.generic', 'Hi {{name}} 👋 how is your week going?', { name });
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
