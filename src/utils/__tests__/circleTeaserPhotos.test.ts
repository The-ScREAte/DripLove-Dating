import { describe, it, expect } from 'vitest';
import { pickTeaserPhotos, isTeaserPhotoSafe, type TeaserPhotoRow } from '../circleTeaserPick';
import { applyCircleCountFilters } from '../circleCountFilters';

const photo = (user_id: string, over: Partial<TeaserPhotoRow> = {}): TeaserPhotoRow => ({
  user_id,
  image_url: `https://img.test/${user_id}-${over.image_order ?? 0}.jpg`,
  image_order: 0,
  is_approved: true,
  moderation_status: 'approved',
  flagged_content: [],
  ...over,
});
const m = (id: string, is_verified = false) => ({ id, is_verified });

describe('isTeaserPhotoSafe (moderation filter)', () => {
  it('accepts an approved, moderated, unflagged photo', () => {
    expect(isTeaserPhotoSafe(photo('a'))).toBe(true);
    expect(isTeaserPhotoSafe(photo('a', { flagged_content: null }))).toBe(true);
  });
  it('rejects pending / rejected / flagged / unapproved / unmoderated / empty-url photos', () => {
    expect(isTeaserPhotoSafe(photo('a', { moderation_status: 'pending' }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { moderation_status: 'rejected' }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { moderation_status: null }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { flagged_content: ['nudity'] }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { is_approved: false }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { is_approved: null }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { image_url: '' }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { image_url: null }))).toBe(false);
    expect(isTeaserPhotoSafe(photo('a', { image_order: -1 }))).toBe(false);
  });
});

describe('pickTeaserPhotos', () => {
  const seed = 'travel:2026-11-26';
  it('returns at most 3 URLs, only URLs (no ids/names)', () => {
    const members = ['a', 'b', 'c', 'd', 'e'].map((id) => m(id));
    const out = pickTeaserPhotos(members, members.map((x) => photo(x.id)), { seed });
    expect(out).toHaveLength(3);
    out.forEach((u) => expect(typeof u).toBe('string'));
  });
  it('skips members whose MAIN photo fails moderation (never falls through to a worse photo)', () => {
    const photos = [
      photo('a', { moderation_status: 'pending' }),
      photo('a', { image_order: 1 }), // a perfectly fine second photo must NOT be used
      photo('b'),
    ];
    expect(pickTeaserPhotos([m('a'), m('b')], photos, { seed })).toEqual(['https://img.test/b-0.jpg']);
  });
  it('uses the lowest-order photo as the main one', () => {
    const photos = [photo('a', { image_order: 2 }), photo('a', { image_order: 0 })];
    expect(pickTeaserPhotos([m('a')], photos, { seed })).toEqual(['https://img.test/a-0.jpg']);
  });
  it('de-duplicates members and URLs', () => {
    const photos = [photo('a'), photo('b', { image_url: 'https://img.test/a-0.jpg' })];
    expect(pickTeaserPhotos([m('a'), m('a'), m('b')], photos, { seed })).toEqual(['https://img.test/a-0.jpg']);
  });
  it('prefers verified members', () => {
    const members = [m('a'), m('b'), m('c'), m('v1', true), m('v2', true)];
    const out = pickTeaserPhotos(members, members.map((x) => photo(x.id)), { seed, max: 2 });
    expect(out.sort()).toEqual(['https://img.test/v1-0.jpg', 'https://img.test/v2-0.jpg']);
  });
  it('is deterministic for the same day and varies across days', () => {
    const members = Array.from({ length: 12 }, (_, i) => m(`u${i}`));
    const photos = members.map((x) => photo(x.id));
    const a = pickTeaserPhotos(members, photos, { seed: 'travel:2026-11-26' });
    expect(pickTeaserPhotos(members, photos, { seed: 'travel:2026-11-26' })).toEqual(a);
    const days = new Set<string>();
    for (let d = 1; d <= 10; d++) days.add(pickTeaserPhotos(members, photos, { seed: `travel:2026-12-${String(d).padStart(2, '0')}` }).join('|'));
    expect(days.size).toBeGreaterThan(1);
  });
  it('falls back to nothing (UI shows silhouettes) when no safe photos exist', () => {
    expect(pickTeaserPhotos([m('a'), m('b')], [photo('a', { moderation_status: 'pending' }), photo('b', { flagged_content: ['x'] })], { seed })).toEqual([]);
    expect(pickTeaserPhotos([], [], { seed })).toEqual([]);
    expect(pickTeaserPhotos([m('a')], [], { seed })).toEqual([]);
  });
  it('returns fewer than 3 when fewer are available (UI fills the rest with silhouettes)', () => {
    expect(pickTeaserPhotos([m('a'), m('b')], [photo('a'), photo('b')], { seed })).toHaveLength(2);
  });
});

describe('applyCircleCountFilters: archived members are INCLUDED', () => {
  const rec = () => {
    const calls: [string, unknown[]][] = [];
    const q: Record<string, unknown> = new Proxy({}, {
      get: (_t, name: string) => (...args: unknown[]) => { calls.push([name, args]); return q; },
    });
    return { q, calls };
  };
  const has = (calls: [string, unknown[]][], m: string, col: string) => calls.some(([n, a]) => n === m && a[0] === col);

  it('does NOT filter on is_archived by default (counts = the pool a member can browse)', () => {
    const { q, calls } = rec();
    applyCircleCountFilters(q, {});
    expect(has(calls, 'eq', 'is_archived')).toBe(false);
    expect(calls.some(([n, a]) => n === 'eq' && a[0] === 'account_status' && a[1] === 'active')).toBe(true);
    expect(calls.some(([n, a]) => n === 'eq' && a[0] === 'is_admin' && a[1] === false)).toBe(true);
  });
  it('the real-photo teaser can still ask for active members only', () => {
    const { q, calls } = rec();
    applyCircleCountFilters(q, { activeOnly: true });
    expect(calls.some(([n, a]) => n === 'eq' && a[0] === 'is_archived' && a[1] === false)).toBe(true);
  });
  it('entire-app scope: no country, gender or age filter at all', () => {
    const { q, calls } = rec();
    applyCircleCountFilters(q, { codes: null, allowedGenders: null, dob: null });
    expect(has(calls, 'in', 'country_code')).toBe(false);
    expect(has(calls, 'in', 'gender')).toBe(false);
    expect(has(calls, 'gte', 'date_of_birth')).toBe(false);
    expect(has(calls, 'lte', 'date_of_birth')).toBe(false);
  });
  it('selected-country scope applies country, gender and age; excluded ids are removed', () => {
    const { q, calls } = rec();
    applyCircleCountFilters(q, { codes: ['GH', 'NG'], allowedGenders: ['female'], dob: { earliest: '1990-01-01', latest: '2005-01-01' }, excluded: new Set(['x', 'y']) });
    expect(has(calls, 'in', 'country_code')).toBe(true);
    expect(has(calls, 'in', 'gender')).toBe(true);
    expect(has(calls, 'gte', 'date_of_birth')).toBe(true);
    expect(calls.some(([n, a]) => n === 'not' && a[0] === 'id' && a[1] === 'in')).toBe(true);
  });
});
