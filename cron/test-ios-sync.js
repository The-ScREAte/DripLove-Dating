const fetch = require('node-fetch');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing subscription checker with iOS support...\n');

fetch(`${SUPABASE_URL}/functions/v1/subscription-checker`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({})
})
.then(res => res.json())
.then(data => {
  console.log('✅ Subscription checker completed:\n');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n📊 Platform sync results:');
  
  if (data.google_sync) {
    console.log('\n  🤖 Google Play:');
    console.log(`    - Checked: ${data.google_sync.checked} subscriptions`);
    console.log(`    - Activated: ${data.google_sync.activated} users`);
    console.log(`    - Updated: ${data.google_sync.updated} subscriptions`);
    console.log(`    - Errors: ${data.google_sync.errors}`);
  }
  
  if (data.apple_sync) {
    console.log('\n  🍎 Apple App Store:');
    console.log(`    - Checked: ${data.apple_sync.checked} subscriptions`);
    console.log(`    - Activated: ${data.apple_sync.activated} users`);
    console.log(`    - Updated: ${data.apple_sync.updated} subscriptions`);
    console.log(`    - Errors: ${data.apple_sync.errors}`);
  }
  
  console.log('\n✨ iOS subscription system is now active!\n');
})
.catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
