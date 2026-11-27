export interface BlockRow {
  blocked_id: string | null;
  blocker_id: string | null;
}

/** Shapes RPC output (array of ids, or of {id}/scalar rows) into rows the exclusion code already understands. */
export function blockRowsFromIds(rows: unknown[]): BlockRow[] {
  const out: BlockRow[] = [];
  for (const r of rows) {
    const id = typeof r === 'string' ? r : r && typeof r === 'object' ? Object.values(r as Record<string, unknown>)[0] : null;
    if (typeof id === 'string' && id) out.push({ blocked_id: id, blocker_id: null });
  }
  return out;
}

/** Set of the other people's ids in either-direction block rows (RPC rows carry only the counterpart in blocked_id). */
export function blockCounterpartIdSet(rows: BlockRow[], selfId: string): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    for (const id of [r.blocked_id, r.blocker_id]) {
      if (id && id !== selfId) out.add(id);
    }
  }
  return out;
}
