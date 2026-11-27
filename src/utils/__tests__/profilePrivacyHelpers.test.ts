import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: (...a: unknown[]) => fromMock(...a),
  },
}));

import { fetchMyProfile, upsertOwnProfile } from '@/utils/myProfile';
import { adminGetProfiles } from '@/utils/adminProfiles';
import {
  PUBLIC_PROFILE_COLUMN_LIST,
  INTERNAL_PROFILE_COLUMN_LIST,
  PUBLIC_PROFILE_COLUMNS,
  isMissingRpcError,
} from '@/utils/profileColumns';

const missingFn = { code: 'PGRST202', message: 'Could not find the function public.get_my_profile in the schema cache' };

/** chainable query-builder stub that resolves to `result` when awaited */
const chain = (result: unknown, calls: Array<[string, unknown[]]> = []) => {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown) => res(result);
      return (...args: unknown[]) => {
        calls.push([String(prop), args]);
        return new Proxy({}, handler);
      };
    },
  };
  return new Proxy({}, handler);
};

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe('isMissingRpcError', () => {
  it('detects missing functions only', () => {
    expect(isMissingRpcError(missingFn)).toBe(true);
    expect(isMissingRpcError({ code: '42883', message: 'x' })).toBe(true);
    expect(isMissingRpcError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });
});

describe('fetchMyProfile', () => {
  it('uses the RPC when it exists', async () => {
    rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: { id: 'u1', email: 'a@b.c' }, error: null }) });
    const res = await fetchMyProfile('u1');
    expect(res.data).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(rpcMock).toHaveBeenCalledWith('get_my_profile');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("falls back to select('*') when the RPC is not deployed yet", async () => {
    rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: missingFn }) });
    const calls: Array<[string, unknown[]]> = [];
    fromMock.mockReturnValue(chain({ data: { id: 'u1', zip_code: '1' }, error: null }, calls));
    const res = await fetchMyProfile('u1');
    expect(res.data).toEqual({ id: 'u1', zip_code: '1' });
    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(calls).toContainEqual(['select', ['*']]);
    expect(calls).toContainEqual(['eq', ['id', 'u1']]);
  });

  it('does NOT fall back on a real RPC error', async () => {
    const boom = { code: '57014', message: 'timeout' };
    rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: boom }) });
    const res = await fetchMyProfile('u1');
    expect(res.error).toBe(boom);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('adminGetProfiles', () => {
  it('calls admin_get_profiles with ids and filters', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'a', email: 'x' }], error: null });
    const res = await adminGetProfiles({ ids: ['a'], filters: { is_admin: false }, newestFirst: true });
    expect(res.data).toEqual([{ id: 'a', email: 'x' }]);
    expect(rpcMock).toHaveBeenCalledWith('admin_get_profiles', {
      p_ids: ['a'], p_limit: 1000, p_offset: 0, p_filters: { is_admin: false }, p_newest_first: true,
    });
  });

  it('returns [] for an empty id list without any request', async () => {
    const res = await adminGetProfiles({ ids: [] });
    expect(res.data).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('falls back to a direct filtered query when the RPC is missing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const calls: Array<[string, unknown[]]> = [];
    fromMock.mockReturnValue(chain({ data: [{ id: 'a' }], error: null }, calls));
    const res = await adminGetProfiles({
      filters: { is_admin: false, countries: ['GH'], archive: 'not_archived', exclude_statuses: ['deleted'] },
      fallbackColumns: 'id, email',
      limit: 10,
      offset: 20,
    });
    expect(res.data).toEqual([{ id: 'a' }]);
    expect(calls).toContainEqual(['select', ['id, email']]);
    expect(calls).toContainEqual(['eq', ['is_admin', false]]);
    expect(calls).toContainEqual(['in', ['country', ['GH']]]);
    expect(calls).toContainEqual(['or', ['is_archived.is.null,is_archived.eq.false']]);
    expect(calls).toContainEqual(['neq', ['account_status', 'deleted']]);
    expect(calls).toContainEqual(['range', [20, 29]]);
  });

  it('surfaces non-missing RPC errors (e.g. not an admin) without falling back', async () => {
    const denied = { code: '42501', message: 'admin only' };
    rpcMock.mockResolvedValue({ data: null, error: denied });
    const res = await adminGetProfiles({ ids: ['a'] });
    expect(res.error).toBe(denied);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('upsertOwnProfile', () => {
  it('updates when the row exists and never inserts', async () => {
    const calls: Array<[string, unknown[]]> = [];
    fromMock.mockReturnValueOnce(chain({ data: [{ id: 'u1' }], error: null }, calls));
    const res = await upsertOwnProfile('u1', { id: 'u1', email: 'a@b.c', bio: 'x' });
    expect(res.error).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(calls).toContainEqual(['update', [{ email: 'a@b.c', bio: 'x' }]]);
    expect(calls).toContainEqual(['select', ['id']]);
  });

  it('inserts when the update touched no rows', async () => {
    const insCalls: Array<[string, unknown[]]> = [];
    fromMock
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ error: null }, insCalls));
    const res = await upsertOwnProfile('u1', { bio: 'x' });
    expect(res.error).toBeNull();
    expect(insCalls).toContainEqual(['insert', [{ bio: 'x', id: 'u1' }]]);
  });
});

describe('column lists', () => {
  it('public and internal lists are disjoint and the select string matches', () => {
    const pub = new Set<string>(PUBLIC_PROFILE_COLUMN_LIST);
    for (const c of INTERNAL_PROFILE_COLUMN_LIST) expect(pub.has(c)).toBe(false);
    expect(PUBLIC_PROFILE_COLUMNS.split(', ')).toEqual([...PUBLIC_PROFILE_COLUMN_LIST]);
    for (const secret of ['email', 'zip_code', 'face_descriptor']) expect(pub.has(secret)).toBe(false);
  });

  it('matches the GRANT SELECT list in the staged migration', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migrations_staged/20261201000000_profiles_column_privacy.sql'),
      'utf8',
    );
    const grant = sql.match(/^grant select \(\n([\s\S]*?)\n\) on public\.profiles to authenticated/m);
    expect(grant).not.toBeNull();
    const cols = grant![1].split(',').map((c) => c.trim()).filter(Boolean);
    expect(cols).toEqual([...PUBLIC_PROFILE_COLUMN_LIST]);
    const mask = [...sql.matchAll(/^\s+v\.([a-z_]+) := null;/gm)].map((m) => m[1]);
    expect(mask).toEqual([...INTERNAL_PROFILE_COLUMN_LIST]);
  });
});
