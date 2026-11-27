/** Removes every key that starts with one of the given prefixes. Pure helper (testable). */
export const removeKeysWithPrefixes = (store: Pick<Storage, 'length' | 'key' | 'removeItem'>, prefixes: string[]): number => {
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && prefixes.some((p) => k.startsWith(p))) doomed.push(k);
  }
  doomed.forEach((k) => store.removeItem(k));
  return doomed.length;
};


const UUID_IN_KEY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Removes every key that is scoped to a member (its name contains a user id), except the listed
 * prefixes. Keeps this working for new per-user keys without having to list each one.
 */
export const removeUserScopedKeys = (store: Pick<Storage, 'length' | 'key' | 'removeItem'>, keepPrefixes: string[] = []): number => {
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && UUID_IN_KEY.test(k) && !keepPrefixes.some((p) => k.startsWith(p))) doomed.push(k);
  }
  doomed.forEach((k) => store.removeItem(k));
  return doomed.length;
};
