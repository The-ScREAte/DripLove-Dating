import { describe, expect, it } from 'vitest';
import {
  ICEBREAKER_MAX_LEN,
  icebreakerAction,
  icebreakerDraftState,
  openerLines,
  chancesDisplay,
  sanitizeIcebreaker,
  sendErrorKey,
  formatCountdown,
  formatRenews,
  msUntil,
  defaultQuota,
  type IcebreakerQuota,
} from '../icebreaker';

const free = (remaining: number, limit = 10): IcebreakerQuota => ({ isPremium: false, limit, used: limit - remaining, remaining });
const premium = (remaining = 10, limit = 10): IcebreakerQuota => ({ isPremium: true, limit, used: limit - remaining, remaining });
const tr = (_k: string, fallback: string, o?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o?.[k] ?? ''));

describe('icebreakerAction (button state machine)', () => {
  const base = { available: true as boolean | null, matched: false, pending: false, quota: free(10) };
  it('is hidden when the backend is missing or it is your own profile', () => {
    expect(icebreakerAction({ ...base, available: false })).toBe('hidden');
    expect(icebreakerAction({ ...base, isOwnProfile: true })).toBe('hidden');
  });
  it('stays visible while availability/quota are still loading (no flicker)', () => {
    expect(icebreakerAction({ ...base, available: null, quota: null })).toBe('send');
  });
  it('matched -> say hi, takes priority over everything', () => {
    expect(icebreakerAction({ ...base, matched: true, pending: true, quota: free(0) })).toBe('say_hi');
  });
  it('pending -> sent (disabled)', () => {
    expect(icebreakerAction({ ...base, pending: true })).toBe('sent');
  });
  it('this week used up -> renewing (same for everyone)', () => {
    expect(icebreakerAction({ ...base, quota: free(0) })).toBe('renewing');
    expect(icebreakerAction({ ...base, quota: premium() })).toBe('send');
    expect(icebreakerAction({ ...base, quota: premium(0) })).toBe('renewing');
    expect(icebreakerAction({ ...base, quota: free(1) })).toBe('send');
  });
});

describe('chancesDisplay (a heart and a number)', () => {
  it('free: 10 a week - shows what is left, then none', () => {
    expect(chancesDisplay(free(10))).toEqual({ kind: 'left', count: 10, limit: 10 });
    expect(chancesDisplay(free(2))).toEqual({ kind: 'left', count: 2, limit: 10 });
    expect(chancesDisplay(free(0))).toEqual({ kind: 'none', premium: false });
  });
  it('premium: shows what is left this week, then none', () => {
    expect(chancesDisplay(premium(10))).toEqual({ kind: 'left', count: 10, limit: 10 });
    expect(chancesDisplay(premium(3))).toEqual({ kind: 'left', count: 3, limit: 10 });
    expect(chancesDisplay(premium(0))).toEqual({ kind: 'none', premium: true });
  });
  it('unknown while loading or when the server gives no number', () => {
    expect(chancesDisplay(null)).toEqual({ kind: 'unknown' });
    expect(chancesDisplay({ isPremium: false, limit: null, used: 0, remaining: null })).toEqual({ kind: 'unknown' });
  });
});

describe('sanitizeIcebreaker / draft state', () => {
  it('strips control chars and angle brackets, trims, caps at 280', () => {
    expect(sanitizeIcebreaker('  Hi <b>there</b>\u0007  ')).toBe('Hi bthere/b');
    expect(sanitizeIcebreaker('x'.repeat(500))).toHaveLength(ICEBREAKER_MAX_LEN);
    expect(sanitizeIcebreaker('   ')).toBe('');
  });
  it('canSend only with real text; warns near the limit; counts emoji as one', () => {
    expect(icebreakerDraftState('').canSend).toBe(false);
    expect(icebreakerDraftState('  \n ').canSend).toBe(false);
    expect(icebreakerDraftState('hello').canSend).toBe(true);
    expect(icebreakerDraftState('👋').length).toBe(1);
    expect(icebreakerDraftState('a'.repeat(270)).nearLimit).toBe(true);
    expect(icebreakerDraftState('a'.repeat(10)).nearLimit).toBe(false);
  });
});

describe('openerLines', () => {
  it('always returns at least the generic opener, with the name filled in', () => {
    expect(openerLines(undefined, 'Ama', tr)).toEqual(['Hi Ama 👋 how is your week going?']);
  });
  it('personalises from interests/music/city, de-duplicates and caps at 3', () => {
    const lines = openerLines(
      [{ basis: 'interest', value: 'Hiking' }, { basis: 'music' }, { basis: 'city', value: 'Accra' }, { basis: 'generic' }, { basis: 'interest', value: 'Hiking' }],
      'Ama',
      tr
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('What got you into hiking?');
    expect(lines[2]).toContain('Accra');
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('sendErrorKey', () => {
  it('maps server codes to calm message keys', () => {
    expect(sendErrorKey('quota_exhausted')).toBe('quota_exhausted');
    expect(sendErrorKey('rate_limited')).toBe('rate_limited');
    expect(sendErrorKey('invalid_recipient')).toBe('unavailable');
    expect(sendErrorKey('not_authenticated')).toBe('unavailable');
    expect(sendErrorKey('something_new')).toBe('generic');
    expect(sendErrorKey(undefined)).toBe('generic');
  });
});

describe('weekly quota + 24h timer helpers', () => {
  it('everyone starts the week with 10', () => {
    expect(defaultQuota(false)).toMatchObject({ limit: 10, remaining: 10, used: 0 });
    expect(defaultQuota(true)).toMatchObject({ limit: 10, remaining: 10 });
  });
  it('formats the running timer as hh:mm:ss and never goes negative', () => {
    expect(formatCountdown(24 * 3600_000)).toBe('24:00:00');
    expect(formatCountdown(23 * 3600_000 + 59 * 60_000 + 7_000)).toBe('23:59:07');
    expect(formatCountdown(61_000)).toBe('00:01:01');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });
  it('rounds a partial second up so it never shows 00:00:00 while time remains', () => {
    expect(formatCountdown(400)).toBe('00:00:01');
  });
  it('msUntil ignores bad input and past times', () => {
    const now = Date.parse('2026-11-28T10:00:00Z');
    expect(msUntil('2026-11-28T11:00:00Z', now)).toBe(3600_000);
    expect(msUntil('2026-11-28T09:00:00Z', now)).toBe(0);
    expect(msUntil(null, now)).toBe(0);
    expect(msUntil('nope', now)).toBe(0);
  });
  it('renew label is short and human', () => {
    expect(formatRenews(6 * 86400_000 + 4 * 3600_000)).toBe('6d 4h');
    expect(formatRenews(2 * 86400_000)).toBe('2d');
    expect(formatRenews(5 * 3600_000 + 20 * 60_000)).toBe('5h 20m');
    expect(formatRenews(30_000)).toBe('1m');
  });
  it('maps the retired "they wrote first" error to the generic message', () => {
    expect(sendErrorKey('reverse_pending')).toBe('generic');
  });
});
