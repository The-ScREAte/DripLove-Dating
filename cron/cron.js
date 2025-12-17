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

// Run every 15 minutes: */15 * * * *
// For testing every minute: * * * * *
cron.schedule('*/15 * * * *', processScheduledBroadcasts);

console.log('🚀 Scheduled broadcasts cron job started');
console.log('📅 Running every 15 minutes');
console.log('🔗 Supabase URL:', SUPABASE_URL);
console.log('⏰ Next run at:', new Date(Date.now() + 15 * 60 * 1000).toLocaleString());

// Run once on startup for testing
processScheduledBroadcasts();
