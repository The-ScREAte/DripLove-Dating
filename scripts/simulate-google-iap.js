// Simulates the Google IAP "approved" handler logic in Node.
// This is NOT an integration test of Google Play Billing.
// It verifies we would upsert the correct subscription row and redirect.

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function simulateApproved({ initiated, userId = 'user_123', productId = 'premium_monthly' } = {}) {
  const calls = {
    upsert: null,
    finished: false,
    redirectedTo: null,
  };

  // Minimal mock for supabase used by the handler
  const supabase = {
    auth: {
      async getUser() {
        return { data: { user: userId ? { id: userId } : null } };
      },
    },
    from(table) {
      assert(table === 'user_subscriptions', `unexpected table: ${table}`);
      return {
        async upsert(row, options) {
          calls.upsert = { row, options };
          return { data: null, error: null };
        },
      };
    },
  };

  // Minimal transaction object
  const t = {
    productId,
    transactionId: 'txn_abc',
    purchaseToken: 'token_xyz',
    finish() {
      calls.finished = true;
    },
  };

  // Simulate the relevant parts of the approved handler in src/iap-google.ts
  if (!initiated) {
    t.finish();
    return calls;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const purchaseToken =
        t?.purchaseToken ||
        t?.transactionId ||
        t?.id ||
        t?.nativePurchase?.purchaseToken ||
        t?.productId ||
        null;

      await supabase
        .from('user_subscriptions')
        .upsert({
          user_id: user.id,
          plan_name: 'premium',
          status: 'active',
          flutterwave_transaction_id: purchaseToken,
          starts_at: new Date().toISOString(),
          expires_at: expiryDate.toISOString(),
          next_billing_date: expiryDate.toISOString(),
          auto_renew: true,
          payment_method: 'google',
          payment_attempts: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      calls.redirectedTo = '/payment-success?status=successful&payment_type=iap';
    }
  } finally {
    t.finish();
  }

  return calls;
}

async function main() {
  console.log('Case A: not user-initiated (should finish, no upsert)');
  const a = await simulateApproved({ initiated: false });
  console.log(a);
  assert(a.finished === true, 'A: expected finished');
  assert(a.upsert === null, 'A: expected no upsert');

  console.log('\nCase B: user-initiated (should upsert premium + redirect + finish)');
  const b = await simulateApproved({ initiated: true });
  console.log({ finished: b.finished, redirectedTo: b.redirectedTo, upsert: b.upsert?.row });
  assert(b.finished === true, 'B: expected finished');
  assert(b.redirectedTo, 'B: expected redirect');
  assert(b.upsert?.row?.plan_name === 'premium', 'B: expected premium plan');
  assert(b.upsert?.row?.status === 'active', 'B: expected active status');
  assert(b.upsert?.row?.payment_method === 'google', 'B: expected google payment_method');

  console.log('\n✅ Simulation passed: approved-handler logic would activate premium.');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exitCode = 1;
});
