/**
 * Pure helpers for the terms -> app hand-off (see src/pages/Index.tsx, TermsAcceptance.tsx).
 */

/** The welcome moment is shown at least this long so it registers... */
export const HANDOFF_MIN_MS = 900;
/** ...and never longer than this: after it the app shows its own skeleton instead of waiting. */
export const HANDOFF_MAX_MS = 4000;
/** One short beat after "content ready" so the first content frame has painted underneath. */
export const HANDOFF_SETTLE_MS = 120;

/** How long to wait (from "content ready") before starting to leave the welcome moment. */
export const handoffLeaveDelay = (startedAt: number, now: number, minMs = HANDOFF_MIN_MS, settleMs = HANDOFF_SETTLE_MS): number =>
  Math.max(settleMs, minMs - (now - startedAt));

const pick = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Best-effort first name from auth user metadata (Google/Apple fill these in). */
export const firstNameFromAuthUser = (user: { user_metadata?: Record<string, unknown> | null } | null | undefined): string | null => {
  const m = user?.user_metadata ?? {};
  const direct = pick(m.first_name) ?? pick(m.given_name);
  if (direct) return direct;
  const full = pick(m.full_name) ?? pick(m.name);
  return full ? full.split(/\s+/)[0] : null;
};
