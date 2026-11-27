import { describe, expect, it } from 'vitest';
import { CHUNK_ERROR_RE, shouldReloadForChunk } from '../chunkReload';

describe('shouldReloadForChunk', () => {
  it('reloads the first time, then not within the cooldown, then again after it', () => {
    expect(shouldReloadForChunk(null, 1000)).toBe(true);
    expect(shouldReloadForChunk(1000, 1000 + 60_000)).toBe(false);
    expect(shouldReloadForChunk(1000, 1000 + 6 * 60_000)).toBe(true);
  });
  it('treats a clock that moved backwards as expired', () => {
    expect(shouldReloadForChunk(5000, 1000)).toBe(true);
  });
});

describe('CHUNK_ERROR_RE', () => {
  it('matches the browsers\' stale-chunk messages only', () => {
    expect(CHUNK_ERROR_RE.test('Failed to fetch dynamically imported module: https://x/chunks/a.js')).toBe(true);
    expect(CHUNK_ERROR_RE.test('Importing a module script failed.')).toBe(true);
    expect(CHUNK_ERROR_RE.test("Cannot read properties of undefined (reading 'id')")).toBe(false);
  });
});
