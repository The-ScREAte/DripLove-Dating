import { describe, expect, it } from 'vitest';
import { removeKeysWithPrefixes, removeUserScopedKeys } from '../storagePrefix';
import { clearImageCache, preloadImageToBlob, trimImageCache, MAX_BLOB_ENTRIES } from '../imageCache';

const fakeStore = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    keys: () => Array.from(m.keys()),
  };
};

describe('removeKeysWithPrefixes', () => {
  it('removes only matching keys', () => {
    const s = fakeStore({ likedMe_v1_a: '1', likedMe_v1_b: '1', dl_popups_v1: '1', keep: '1' });
    expect(removeKeysWithPrefixes(s, ['likedMe_v1_'])).toBe(2);
    expect(s.keys().sort()).toEqual(['dl_popups_v1', 'keep']);
  });
});

describe('removeUserScopedKeys', () => {
  it('removes keys carrying a user id, keeps device keys and the keep list', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const s = fakeStore({ [`swiped_profiles_${id}`]: '1', [`driplove_circle_pool_${id}`]: '1', [`driplove_swipe_guide_shown_${id}`]: '1', i18nextLng: 'en', dl_popups_v1: '{}' });
    expect(removeUserScopedKeys(s, ['driplove_swipe_guide_shown_'])).toBe(2);
    expect(s.keys().sort()).toEqual([`driplove_swipe_guide_shown_${id}`, 'dl_popups_v1', 'i18nextLng'].sort());
  });
});

describe('image blob cache', () => {
  it('stays bounded and clears', async () => {
    const revoked: string[] = [];
    let n = 0;
    URL.createObjectURL = () => `blob:x${n++}`;
    URL.revokeObjectURL = (u: string) => revoked.push(u);
    globalThis.fetch = (async () => ({ ok: true, blob: async () => ({ type: 'image/png' }) })) as unknown as typeof fetch;
    for (let i = 0; i < MAX_BLOB_ENTRIES + 20; i++) await preloadImageToBlob(`https://x/${i}.png`);
    expect(revoked.length).toBe(20);
    trimImageCache(10);
    expect(revoked.length).toBe(20 + MAX_BLOB_ENTRIES - 10);
    clearImageCache();
    expect(revoked.length).toBe(20 + MAX_BLOB_ENTRIES);
  });
});
