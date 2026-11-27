import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

import { logAppError, getErrorLog, clearErrorLog, formatErrorLog } from '../errorLog';

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', localStorageStub);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('errorLog', () => {
  it('records name, message, component stack and tab', () => {
    logAppError('tab:profile', new TypeError('boom'), { componentStack: '\n    at ProfilePage' }, { tab: 'profile' });
    const [entry] = getErrorLog();
    expect(entry.name).toBe('TypeError');
    expect(entry.message).toBe('boom');
    expect(entry.componentStack).toContain('ProfilePage');
    expect(entry.tab).toBe('profile');
    expect(entry.source).toBe('tab:profile');
  });

  it('keeps only the most recent 20 entries (ring buffer)', () => {
    for (let i = 0; i < 35; i += 1) logAppError('app', new Error(`e${i}`));
    const log = getErrorLog();
    expect(log).toHaveLength(20);
    expect(log[0].message).toBe('e15');
    expect(log[19].message).toBe('e34');
  });

  it('never throws, even if storage is unavailable or the thrown value is not an Error', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => logAppError('app', 'a string was thrown')).not.toThrow();
    expect(() => clearErrorLog()).not.toThrow();
    expect(getErrorLog()).toEqual([]);
  });

  it('formats a readable report for support and says so when empty', () => {
    expect(formatErrorLog()).toBe('No errors recorded.');
    logAppError('app', new Error('x'), { componentStack: 'at Foo' });
    expect(formatErrorLog()).toContain('Error: x');
    expect(formatErrorLog()).toContain('at Foo');
  });
});
