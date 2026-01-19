const cron = require('node-cron');
const fetch = require('node-fetch');

// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables!');
  console.error('Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const processScheduledBroadcasts = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Processing scheduled broadcasts...`);
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/process-scheduled-broadcasts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Success:', data.message);
      if (data.results && data.results.length > 0) {
        data.results.forEach(result => {
          if (result.error) {
            console.log(`  ❌ ${result.title}: ${result.error}`);
          } else {
            console.log(`  ✓ ${result.title}: ${result.successful} sent, ${result.failed} failed`);
          }
        });
      } else {
        console.log('  No broadcasts to process');
      }
    } else {
      console.error('❌ Error:', data);
    }
  } catch (error) {
    console.error('❌ Failed to process scheduled broadcasts:', error.message);
  }
};

const getInternalSecret = async (key) => {
  try {
    const url = `${SUPABASE_URL}/rest/v1/internal_secrets?key=eq.${encodeURIComponent(key)}&select=value`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[${new Date().toISOString()}] ❌ Failed to fetch internal secret ${key}:`, text);
      return null;
    }

    const rows = await response.json();
    return rows?.[0]?.value || null;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Failed to fetch internal secret ${key}:`, error.message);
    return null;
  }
};

const processPaystackRecurringBilling = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Processing Paystack recurring billing...`);

    const cronSecret = await getInternalSecret('paystack_billing_cron_secret');
    if (!cronSecret) {
      console.error(`[${new Date().toISOString()}] ❌ Missing paystack_billing_cron_secret (internal_secrets)`);
      return;
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/paystack-recurring-billing`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({}),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      console.log('✅ Paystack billing success:', data.message || data);
      if (typeof data.processed === 'number') {
        console.log(`  processed=${data.processed} charged=${data.charged} failed=${data.failed}`);
      }
    } else {
      console.error('❌ Paystack billing error:', data);
    }
  } catch (error) {
    console.error('❌ Failed to process Paystack recurring billing:', error.message);
  }
};

const processSubscriptionChecker = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Running subscription checker...`);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/subscription-checker`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      console.log('✅ Subscription checker success:', data.message || data);
    } else {
      console.error('❌ Subscription checker error:', data);
    }
  } catch (error) {
    console.error('❌ Failed to run subscription checker:', error.message);
  }
};

// Sync Google subscriptions - backup for webhook failures
const processGoogleSync = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Running Google subscription sync...`);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/sync-google-subscriptions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      console.log('✅ Google sync success:', data.message || data);
      if (typeof data.updated === 'number') {
        console.log(`  updated=${data.updated} expired=${data.expired} errors=${data.errors}`);
      }
    } else {
      console.error('❌ Google sync error:', data);
    }
  } catch (error) {
    console.error('❌ Failed to sync Google subscriptions:', error.message);
  }
};

// Run every 15 minutes: */15 * * * *
// For testing every minute: * * * * *
cron.schedule('*/15 * * * *', processScheduledBroadcasts);

// Paystack recurring billing (every hour at :05)
cron.schedule('5 * * * *', processPaystackRecurringBilling);

// Subscription status check (every hour at :10) - now includes Google sync
cron.schedule('10 * * * *', processSubscriptionChecker);

// Google subscription sync (every 4 hours as extra backup - subscription-checker does hourly sync now)
cron.schedule('0 */4 * * *', processGoogleSync);

console.log('🚀 Scheduled broadcasts cron job started');
console.log('📅 Broadcasts: every 15 minutes');
console.log('💳 Paystack billing: hourly at :05');
console.log('🔍 Subscription checker: hourly at :10 (includes Google sync)');
console.log('🔄 Google full sync: every 4 hours');
console.log('🔗 Supabase URL:', SUPABASE_URL);
console.log('⏰ Next broadcast run at:', new Date(Date.now() + 15 * 60 * 1000).toLocaleString());

// Run once on startup for testing
processScheduledBroadcasts();
