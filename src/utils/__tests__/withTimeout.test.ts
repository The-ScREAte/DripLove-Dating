import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from '../withTimeout';

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 50, 'fast')).resolves.toBe(42);
  });

  it('propagates the original rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, 'x')).rejects.toThrow('boom');
  });

  it('rejects with a labelled timeout error when too slow', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 100, 'slow');
    const assertion = expect(pending).rejects.toThrow('Timeout: slow');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    vi.useRealTimers();
  });
});
