import { describe, expect, it } from 'vitest';
import {
  ICEBREAKER_MAX_LEN,
  icebreakerAction,
  icebreakerDraftState,
  openerLines,
  chancesDisplay,
  sanitizeIcebreaker,
  sendErrorKey,
  shortAgo,
  type IcebreakerQuota,
} from '../icebreaker';

const free = (remaining: number, limit = 4): IcebreakerQuota => ({ isPremium: false, limit, used: limit - remaining, remaining });
const premium = (remaining = 10, limit = 10): IcebreakerQuota => ({ isPremium: true, limit, used: limit - remaining, remaining });
const tr = (_k: string, fallback: string, o?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o?.[k] ?? ''));

describe('icebreakerAction (button state machine)', () => {
  const base = { available: true as boolean | null, matched: false, pending: false, quota: free(4) };
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
  it('free quota used up -> upgrade; premium never', () => {
    expect(icebreakerAction({ ...base, quota: free(0) })).toBe('upgrade');
    expect(icebreakerAction({ ...base, quota: premium() })).toBe('send');
    expect(icebreakerAction({ ...base, quota: premium(0) })).toBe('send'); // the server answers with the daily-limit message
    expect(icebreakerAction({ ...base, quota: free(1) })).toBe('send');
  });
});

describe('chancesDisplay (a heart and a number)', () => {
  it('free: 4 in total - shows what is left, then none', () => {
    expect(chancesDisplay(free(4))).toEqual({ kind: 'left', count: 4, limit: 4 });
    expect(chancesDisplay(free(2))).toEqual({ kind: 'left', count: 2, limit: 4 });
    expect(chancesDisplay(free(0))).toEqual({ kind: 'none', premium: false });
  });
  it('premium: 10 a day - shows what is left today, then none', () => {
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

describe('shortAgo', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  it('formats now / minutes / hours / days', () => {
    expect(shortAgo('2026-11-27T11:59:30Z', now)).toBe('now');
    expect(shortAgo('2026-11-27T11:55:00Z', now)).toBe('5m');
    expect(shortAgo('2026-11-27T09:00:00Z', now)).toBe('3h');
    expect(shortAgo('2026-11-25T12:00:00Z', now)).toBe('2d');
    expect(shortAgo('garbage', now)).toBe('');
  });
});
