import { describe, expect, it } from 'vitest';
import { claimPaymentReference, computeMinimumGhs, evaluateGhsPayment } from '../payment-guards';

describe('computeMinimumGhs', () => {
  it('uses the larger of the absolute floor and price x fx floor', () => {
    expect(computeMinimumGhs(5, 5, 3)).toBe(15);
    expect(computeMinimumGhs(1, 5, 3)).toBe(5);
    expect(computeMinimumGhs(0, 5, 3)).toBe(5);
  });
  it('falls back to safe defaults for bad inputs', () => {
    expect(computeMinimumGhs(Number.NaN, Number.NaN, Number.NaN)).toBe(5);
    expect(computeMinimumGhs(5, 5, Number.NaN)).toBe(15);
  });
  it('rounds to pesewas', () => {
    expect(computeMinimumGhs(4.99, 5, 3)).toBe(14.97);
  });
});

describe('evaluateGhsPayment', () => {
  it('accepts a real-priced GHS payment', () => {
    expect(evaluateGhsPayment(55, 'GHS', 15).ok).toBe(true);
    expect(evaluateGhsPayment(55, 'ghs', 15).ok).toBe(true);
  });
  it('rejects one-pesewa style abuse payments', () => {
    expect(evaluateGhsPayment(0.01, 'GHS', 15).ok).toBe(false);
    expect(evaluateGhsPayment(14.99, 'GHS', 15).ok).toBe(false);
  });
  it('rejects other currencies and invalid amounts', () => {
    expect(evaluateGhsPayment(100, 'NGN', 15).ok).toBe(false);
    expect(evaluateGhsPayment(Number.NaN, 'GHS', 15).ok).toBe(false);
  });
});

/** Minimal in-memory stand-in for the subscription_payments table + the query chain the guard uses. */
function fakeSupabase(opts: { uniqueIndex?: boolean } = {}) {
  type Row = { id: string; created_at: string; transaction_id: string; [k: string]: unknown };
  const rows: Row[] = [];
  let seq = 0;
  const api = {
    rows,
    from(_table: string) {
      let mode: 'insert' | 'select' | 'delete' = 'select';
      let pending: Record<string, unknown> | null = null;
      let eqCol: string | null = null;
      let eqVal: unknown = null;
      let limitN = Infinity;
      const q: Record<string, unknown> = {
        insert(row: Record<string, unknown>) { mode = 'insert'; pending = row; return q; },
        select(_cols?: string) { return q; },
        delete() { mode = 'delete'; return q; },
        eq(col: string, val: unknown) { eqCol = col; eqVal = val; return q; },
        order() { return q; },
        limit(n: number) { limitN = n; return q; },
        async single() {
          if (mode === 'insert' && pending) {
            if (opts.uniqueIndex && rows.some((r) => r.transaction_id === pending!.transaction_id)) {
              return { data: null, error: { code: '23505' } };
            }
            seq += 1;
            const row = { id: `id-${seq}`, created_at: new Date(1_700_000_000_000 + seq).toISOString(), ...pending } as Row;
            rows.push(row);
            return { data: { id: row.id }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          if (mode === 'select') {
            const found = rows
              .filter((r) => (eqCol ? r[eqCol] === eqVal : true))
              .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
              .slice(0, limitN);
            resolve({ data: found, error: null });
          } else if (mode === 'delete') {
            const idx = rows.findIndex((r) => (eqCol ? r[eqCol] === eqVal : false));
            if (idx >= 0) rows.splice(idx, 1);
            resolve({ data: null, error: null });
          } else {
            resolve({ data: null, error: null });
          }
        },
      };
      return q;
    },
  };
  return api;
}

const input = (ref: string) => ({
  user_id: 'u1',
  amount: 55,
  currency: 'GHS',
  payment_method: 'paystack',
  transaction_id: ref,
});

describe('claimPaymentReference', () => {
  it('first caller claims, a duplicate delivery of the same reference does not', async () => {
    const db = fakeSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = await claimPaymentReference(db as any, input('ref-1'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second = await claimPaymentReference(db as any, input('ref-1'));
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(db.rows).toHaveLength(1);
  });

  it('different references are independent', async () => {
    const db = fakeSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await claimPaymentReference(db as any, input('a'))).claimed).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await claimPaymentReference(db as any, input('b'))).claimed).toBe(true);
  });

  it('treats a unique-index violation (23505) as already claimed', async () => {
    const db = fakeSupabase({ uniqueIndex: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await claimPaymentReference(db as any, input('ref-2'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dup = await claimPaymentReference(db as any, input('ref-2'));
    expect(dup.claimed).toBe(false);
  });

  it('with no reference there is nothing to dedupe on (legacy behaviour)', async () => {
    const db = fakeSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await claimPaymentReference(db as any, input(''));
    expect(res.claimed).toBe(true);
    expect(db.rows).toHaveLength(0);
  });
});
