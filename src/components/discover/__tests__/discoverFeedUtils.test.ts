import { describe, it, expect } from 'vitest';
import {
  formatUuidInFilter,
  isUuid,
  uniqUuids,
  getUserFeedSeed,
  buildFeedSignature,
  buildSavedOrderKey,
  normalizeCountryCodeList,
} from '../discoverFeedUtils';

describe('discoverFeedUtils', () => {
  it('validates UUID format correctly', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('deduplicates UUID list and excludes invalid values', () => {
    const values: unknown[] = [
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
      'bad',
      42,
    ];

    expect(uniqUuids(values)).toEqual([
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
    ]);
  });

  it('builds in-filter with bounded length', () => {
    const ids = [
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ];

    const full = formatUuidInFilter(ids, 200);
    const bounded = formatUuidInFilter(ids, 50);

    expect(full.startsWith('(')).toBe(true);
    expect(full.endsWith(')')).toBe(true);
    expect(bounded.length).toBeLessThanOrEqual(50);
  });

  it('creates deterministic user feed seed', () => {
    const seed1 = getUserFeedSeed('user-1');
    const seed2 = getUserFeedSeed('user-1');

    expect(seed1).toEqual(seed2);
    expect(seed1.startsWith('user-1_')).toBe(true);
  });

  it('builds stable feed signature output', () => {
    const signature = buildFeedSignature('US', ['GH', 'DE'], true, 120);
    expect(signature.startsWith('v10_')).toBe(true);
  });

  it('builds saved order key with user id and signature', () => {
    const key = buildSavedOrderKey('user-1', 'sig-abc');
    expect(key).toContain('driplove_profile_order_user-1_');
    expect(key.endsWith('_sig-abc')).toBe(true);
  });

  it('normalizes country list values and excludes base country', () => {
    expect(normalizeCountryCodeList(['us', 'GH', ''], 'US')).toEqual(['GH']);
    expect(normalizeCountryCodeList('["de","us"]', 'US')).toEqual(['DE']);
    expect(normalizeCountryCodeList('')).toEqual([]);
  });
});
