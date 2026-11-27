import { describe, expect, it, vi } from 'vitest';
import { isTransientInvokeError, withTransientRetry } from '../iapRetry';

type Res = { data?: unknown; error?: unknown };

describe('isTransientInvokeError', () => {
  it('treats network/relay errors as transient', () => {
    expect(isTransientInvokeError({ name: 'FunctionsFetchError' })).toBe(true);
    expect(isTransientInvokeError({ name: 'FunctionsRelayError' })).toBe(true);
    expect(isTransientInvokeError(new Error('Receipt validation timeout'))).toBe(true);
    expect(isTransientInvokeError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('treats 5xx/408/429 as transient but other 4xx as definitive', () => {
    const http = (status: number) => ({ name: 'FunctionsHttpError', context: { status } });
    expect(isTransientInvokeError(http(500))).toBe(true);
    expect(isTransientInvokeError(http(503))).toBe(true);
    expect(isTransientInvokeError(http(408))).toBe(true);
    expect(isTransientInvokeError(http(429))).toBe(true);
    expect(isTransientInvokeError(http(400))).toBe(false);
    expect(isTransientInvokeError(http(401))).toBe(false);
    expect(isTransientInvokeError(http(403))).toBe(false);
  });

  it('is false for no error', () => {
    expect(isTransientInvokeError(null)).toBe(false);
    expect(isTransientInvokeError(undefined)).toBe(false);
  });
});

describe('withTransientRetry', () => {
  const noSleep = () => Promise.resolve();

  it('returns immediately on success', async () => {
    const fn = vi.fn<() => Promise<Res>>().mockResolvedValue({ data: 1, error: null });
    const res = await withTransientRetry(fn, [1, 1], noSleep);
    expect(res.data).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors then succeeds', async () => {
    const fn = vi
      .fn<() => Promise<Res>>()
      .mockResolvedValueOnce({ error: { name: 'FunctionsFetchError' } })
      .mockResolvedValueOnce({ data: 'ok', error: null });
    const res = await withTransientRetry(fn, [1, 1], noSleep);
    expect(res.data).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry definitive errors', async () => {
    const fn = vi.fn<() => Promise<Res>>().mockResolvedValue({ error: { name: 'FunctionsHttpError', context: { status: 400 } } });
    await withTransientRetry(fn, [1, 1], noSleep);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the schedule and returns the last transient error', async () => {
    const fn = vi.fn<() => Promise<Res>>().mockResolvedValue({ error: { name: 'FunctionsFetchError' } });
    const res = await withTransientRetry(fn, [1, 1], noSleep);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(res.error).toBeTruthy();
  });

  it('retries thrown transient errors and rethrows definitive ones', async () => {
    const flaky = vi.fn<() => Promise<Res>>().mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ data: 2 });
    expect((await withTransientRetry(flaky, [1], noSleep)).data).toBe(2);
    const bad = vi.fn<() => Promise<Res>>().mockRejectedValue(new Error('invalid receipt'));
    await expect(withTransientRetry(bad, [1], noSleep)).rejects.toThrow('invalid receipt');
  });
});
