import { describe, it, expect } from 'vitest';
import { blockRowsFromIds } from '../blockRows';

describe('blockRowsFromIds', () => {
  it('accepts plain ids and single-column rows, drops junk', () => {
    expect(blockRowsFromIds(['a', { get_block_counterparts: 'b' }, null, 5, ''])).toEqual([
      { blocked_id: 'a', blocker_id: null },
      { blocked_id: 'b', blocker_id: null },
    ]);
  });
});

import { blockCounterpartIdSet } from '../blockRows';
describe('blockCounterpartIdSet', () => {
  it('collects counterparts in either direction and ignores self/null', () => {
    const s = blockCounterpartIdSet([
      { blocked_id: 'b', blocker_id: 'me' },
      { blocked_id: 'me', blocker_id: 'c' },
      { blocked_id: 'd', blocker_id: null },
    ], 'me');
    expect([...s].sort()).toEqual(['b', 'c', 'd']);
  });
});
