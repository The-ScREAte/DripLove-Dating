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

const free = (remaining: number, limit = 3): IcebreakerQuota => ({ isPremium: false, limit, used: limit - remaining, remaining });
const premium: IcebreakerQuota = { isPremium: true, limit: null, used: 40, remaining: null };
const tr = (_k: string, fallback: string, o?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o?.[k] ?? ''));

describe('icebreakerAction (button state machine)', () => {
  const base = { available: true as boolean | null, matched: false, pending: false, quota: free(3) };
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
    expect(icebreakerAction({ ...base, quota: premium })).toBe('send');
    expect(icebreakerAction({ ...base, quota: free(1) })).toBe('send');
  });
});

describe('chancesDisplay (the "chances" pill)', () => {
  it('free: all left -> "3 chances left"; some used -> "2 of 3"; one -> "1 chance left"; none -> go Premium', () => {
    expect(chancesDisplay(free(3))).toEqual({ kind: 'left', count: 3 });
    expect(chancesDisplay(free(2))).toEqual({ kind: 'of', count: 2, limit: 3 });
    expect(chancesDisplay(free(1))).toEqual({ kind: 'left', count: 1 });
    expect(chancesDisplay(free(0))).toEqual({ kind: 'none', limit: 3 });
  });
  it('premium: unlimited; unknown while loading', () => {
    expect(chancesDisplay(premium)).toEqual({ kind: 'unlimited' });
    expect(chancesDisplay(null)).toEqual({ kind: 'unknown' });
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
