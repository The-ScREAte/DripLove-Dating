import { describe, expect, it, vi } from 'vitest';
import { pushBackHandler } from '../backStack';

describe('pushBackHandler', () => {
  it('registers and unregisters without throwing on the web', () => {
    const handler = vi.fn();
    const unregister = pushBackHandler(handler);
    expect(typeof unregister).toBe('function');
    unregister();
    // Unregistering twice must be harmless.
    expect(() => unregister()).not.toThrow();
  });
});
